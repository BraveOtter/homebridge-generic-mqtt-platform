import type {
  API,
  Characteristic as CharacteristicType,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service as ServiceType,
} from 'homebridge';

import type { AccessoryConfig, CharacteristicConfig, ServiceConfig } from './config.js';
import { resolveServiceConstructor } from './service-mapper.js';
import { resolveCharacteristicConstructor, type CharacteristicConstructor } from './characteristic-mapper.js';
import type { MqttClientWrapper } from './mqtt-client.js';

interface CharacteristicState {
  value: CharacteristicValue;
  lastUpdate: number;
}

/**
 * Manages a single PlatformAccessory: creates HomeKit services from config,
 * subscribes to MQTT topics, and bridges reads/writes in both directions.
 */
export class AccessoryHandler {
  private readonly Service: typeof ServiceType;
  private readonly Characteristic: typeof CharacteristicType;

  /** In-memory state cache keyed by "serviceSubtype::characteristicName" */
  private readonly state = new Map<string, CharacteristicState>();

  /** Debounce timers keyed by the same composite key */
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Track availability */
  private available = true;

  constructor(
    private readonly log: Logging,
    private readonly api: API,
    private readonly mqttClient: MqttClientWrapper,
    private readonly accessory: PlatformAccessory,
    private readonly config: AccessoryConfig,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.setupAccessoryInformation();
    this.setupServices();
    this.setupAvailability();
  }

  // ---------------------------------------------------------------------------
  // Accessory Information
  // ---------------------------------------------------------------------------

  private setupAccessoryInformation(): void {
    const infoService = this.accessory.getService(this.Service.AccessoryInformation);
    if (infoService) {
      infoService
        .setCharacteristic(this.Characteristic.Manufacturer, this.config.manufacturer ?? 'Generic MQTT')
        .setCharacteristic(this.Characteristic.Model, this.config.model ?? 'MQTT Device')
        .setCharacteristic(this.Characteristic.SerialNumber, this.config.serialNumber ?? this.config.id)
        .setCharacteristic(this.Characteristic.FirmwareRevision, this.config.firmwareRevision ?? '1.0.0');
    }
  }

  // ---------------------------------------------------------------------------
  // Service & characteristic setup
  // ---------------------------------------------------------------------------

  private setupServices(): void {
    // Collect service names/subtypes that should exist so we can prune stale ones
    const expectedServiceKeys = new Set<string>();

    for (const svcConfig of this.config.services) {
      const ServiceConstructor = resolveServiceConstructor(this.Service, svcConfig.type);
      if (!ServiceConstructor) {
        this.log.error('[%s] Unknown service type "%s" — skipping', this.config.id, svcConfig.type);
        continue;
      }

      const subtype = svcConfig.subtype ?? svcConfig.name;
      expectedServiceKeys.add(`${svcConfig.type}::${subtype}`);

      // Retrieve or create the service
      const service = this.accessory.getService(svcConfig.name)
        || this.accessory.addService(ServiceConstructor, svcConfig.name, subtype);

      // Ensure display name is set
      service.setCharacteristic(this.Characteristic.Name, svcConfig.name);

      this.setupCharacteristics(service, svcConfig, subtype);
    }

    // Remove services that no longer exist in config (except AccessoryInformation).
    // Snapshot the array first — removeService mutates it.
    const currentServices = [...this.accessory.services];
    for (const service of currentServices) {
      if (service.UUID === this.Service.AccessoryInformation.UUID) {
        continue;
      }
      const key = `${this.serviceTypeName(service)}::${service.subtype ?? service.displayName}`;
      if (!expectedServiceKeys.has(key)) {
        this.log.info('[%s] Removing stale service "%s"', this.config.id, service.displayName);
        this.accessory.removeService(service);
      }
    }
  }

  private setupCharacteristics(service: ServiceType, svcConfig: ServiceConfig, subtype: string): void {
    for (const [charName, charConfig] of Object.entries(svcConfig.characteristics)) {
      const CharCtor = resolveCharacteristicConstructor(this.Characteristic, charName);
      if (!CharCtor) {
        this.log.error('[%s] Unknown characteristic "%s" in service "%s" — skipping', this.config.id, charName, svcConfig.name);
        continue;
      }

      const characteristic = service.getCharacteristic(CharCtor);
      if (!characteristic) {
        this.log.error('[%s] Characteristic "%s" not available on service "%s"', this.config.id, charName, svcConfig.name);
        continue;
      }

      const stateKey = `${subtype}::${charName}`;

      // Push default value to both the state cache and the actual HAP characteristic
      if (charConfig.defaultValue !== undefined) {
        const defaultVal = charConfig.defaultValue as CharacteristicValue;
        this.state.set(stateKey, { value: defaultVal, lastUpdate: Date.now() });
        characteristic.updateValue(defaultVal);
      }

      // onGet handler — always register so HomeKit can read the cached state
      characteristic.onGet(() => {
        const cached = this.state.get(stateKey);
        if (cached !== undefined) {
          return cached.value;
        }
        return characteristic.value ?? 0;
      });

      // Subscribe to MQTT for incoming updates
      if (charConfig.getTopic) {
        this.subscribeCharacteristic(stateKey, charName, charConfig, service, CharCtor);
      }

      // onSet handler — publish to MQTT
      if (charConfig.setTopic) {
        characteristic.onSet((value: CharacteristicValue) => {
          this.state.set(stateKey, { value, lastUpdate: Date.now() });
          const payload = this.encodeValue(value, charConfig);
          this.log.debug('[%s] SET %s → "%s" (topic: %s)', this.config.id, charName, payload, charConfig.setTopic);
          this.mqttClient.publish(charConfig.setTopic!, payload);
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MQTT subscription for a single characteristic
  // ---------------------------------------------------------------------------

  private subscribeCharacteristic(
    stateKey: string,
    charName: string,
    charConfig: CharacteristicConfig,
    service: ServiceType,
    charCtor: CharacteristicConstructor,
  ): void {
    this.mqttClient.subscribe(charConfig.getTopic!, (_topic, message) => {
      const raw = charConfig.jsonPath ? this.extractJsonPath(message, charConfig.jsonPath) : message;
      if (raw === undefined) {
        this.log.warn('[%s] Could not extract jsonPath "%s" from payload', this.config.id, charConfig.jsonPath);
        return;
      }

      const value = this.decodeValue(raw, charConfig);
      if (value === undefined) {
        this.log.warn('[%s] Could not decode value "%s" for %s', this.config.id, raw, charName);
        return;
      }

      // Debounce if configured
      if (charConfig.debounce && charConfig.debounce > 0) {
        const existing = this.debounceTimers.get(stateKey);
        if (existing) {
          clearTimeout(existing);
        }
        this.debounceTimers.set(stateKey, setTimeout(() => {
          this.pushUpdate(stateKey, charName, value, service, charCtor);
          this.debounceTimers.delete(stateKey);
        }, charConfig.debounce));
      } else {
        this.pushUpdate(stateKey, charName, value, service, charCtor);
      }
    });

    this.log.debug('[%s] Subscribed %s ← "%s"', this.config.id, charName, charConfig.getTopic);
  }

  private pushUpdate(
    stateKey: string,
    charName: string,
    value: CharacteristicValue,
    service: ServiceType,
    charCtor: CharacteristicConstructor,
  ): void {
    this.state.set(stateKey, { value, lastUpdate: Date.now() });
    service.updateCharacteristic(charCtor, value);
    this.log.debug('[%s] UPDATE %s = %s', this.config.id, charName, String(value));
  }

  // ---------------------------------------------------------------------------
  // Availability
  // ---------------------------------------------------------------------------

  private setupAvailability(): void {
    if (!this.config.availabilityTopic) {
      return;
    }

    const onlinePayload = this.config.availabilityOnline ?? 'online';
    const offlinePayload = this.config.availabilityOffline ?? 'offline';

    this.mqttClient.subscribe(this.config.availabilityTopic, (_topic, message) => {
      const trimmed = message.trim().toLowerCase();
      if (trimmed === onlinePayload.toLowerCase()) {
        if (!this.available) {
          this.log.info('[%s] Device is now online', this.config.id);
        }
        this.available = true;
      } else if (trimmed === offlinePayload.toLowerCase()) {
        if (this.available) {
          this.log.warn('[%s] Device is now offline', this.config.id);
        }
        this.available = false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Value encoding / decoding
  // ---------------------------------------------------------------------------

  /**
   * Decode an MQTT payload string into a HomeKit CharacteristicValue.
   * Handles boolean-like mappings, numeric parsing, scaling, and clamping.
   */
  private decodeValue(raw: string, config: CharacteristicConfig): CharacteristicValue | undefined {
    const trimmed = raw.trim();

    // Boolean / active mapping
    if (config.onValue !== undefined || config.offValue !== undefined) {
      if (config.onValue !== undefined && trimmed === config.onValue) {
        return 1;
      }
      if (config.offValue !== undefined && trimmed === config.offValue) {
        return 0;
      }
      // Also support native boolean-like strings as fallback
      if (['true', '1', 'on'].includes(trimmed.toLowerCase())) {
        return 1;
      }
      if (['false', '0', 'off'].includes(trimmed.toLowerCase())) {
        return 0;
      }
      return undefined;
    }

    // Try parsing as number
    const num = Number(trimmed);
    if (!isNaN(num)) {
      let value = num;
      if (config.scale !== undefined) {
        value *= config.scale;
      }
      if (config.offset !== undefined) {
        value += config.offset;
      }
      if (config.minValue !== undefined) {
        value = Math.max(value, config.minValue);
      }
      if (config.maxValue !== undefined) {
        value = Math.min(value, config.maxValue);
      }
      return value;
    }

    // Boolean strings without explicit onValue/offValue
    const lower = trimmed.toLowerCase();
    if (['true', 'on'].includes(lower)) {
      return true;
    }
    if (['false', 'off'].includes(lower)) {
      return false;
    }

    // Return raw string as last resort
    return trimmed;
  }

  /**
   * Encode a HomeKit CharacteristicValue into an MQTT payload string.
   */
  private encodeValue(value: CharacteristicValue, config: CharacteristicConfig): string {
    if (config.onValue !== undefined && config.offValue !== undefined) {
      // Map booleans and active/inactive to configured payloads
      if (value === true || value === 1) {
        return config.onValue;
      }
      if (value === false || value === 0) {
        return config.offValue;
      }
    }
    return String(value);
  }

  // ---------------------------------------------------------------------------
  // JSON path extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract a value from a JSON payload using a dot-separated path.
   * Returns the stringified primitive value, or undefined if not found.
   */
  private extractJsonPath(payload: string, path: string): string | undefined {
    try {
      let obj: unknown = JSON.parse(payload);
      for (const key of path.split('.')) {
        if (obj === null || obj === undefined || typeof obj !== 'object') {
          return undefined;
        }
        obj = (obj as Record<string, unknown>)[key];
      }
      return obj === null || obj === undefined ? undefined : String(obj);
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /** Best-effort reverse lookup of service UUID to type name. */
  private serviceTypeName(service: ServiceType): string {
    for (const svcConfig of this.config.services) {
      const ctor = resolveServiceConstructor(this.Service, svcConfig.type);
      if (ctor && service.UUID === ctor.UUID) {
        return svcConfig.type;
      }
    }
    return service.UUID;
  }
}
