import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import type { GenericMqttPlatformConfig } from './config.js';
import { validateConfig } from './config-validator.js';
import { MqttClientWrapper } from './mqtt-client.js';
import { AccessoryHandler } from './accessory-handler.js';

/**
 * GenericMqttPlatform
 *
 * Dynamic Homebridge platform plugin that creates HomeKit accessories from
 * configuration, mapping MQTT topics to services and characteristics.
 */
export class GenericMqttPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  /** Cached accessories restored by Homebridge on startup */
  private readonly cachedAccessories = new Map<string, PlatformAccessory>();

  /** UUIDs of accessories we actually configured this run */
  private readonly activeUUIDs = new Set<string>();

  /** MQTT client shared across all accessories */
  private mqttClient!: MqttClientWrapper;

  /** Typed reference to our config */
  private readonly pluginConfig: GenericMqttPlatformConfig;

  constructor(
    public readonly log: Logging,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.pluginConfig = config as GenericMqttPlatformConfig;

    this.log.debug('Initializing GenericMqttPlatform');

    this.api.on('didFinishLaunching', () => {
      this.bootstrap();
    });

    this.api.on('shutdown', () => {
      this.shutdown();
    });
  }

  // ---------------------------------------------------------------------------
  // Homebridge lifecycle: restore cached accessories
  // ---------------------------------------------------------------------------

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Restoring cached accessory: %s', accessory.displayName);
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  private bootstrap(): void {
    // Validate config
    if (!validateConfig(this.pluginConfig, this.log)) {
      this.log.error('Invalid configuration — plugin will not start. Check errors above.');
      return;
    }

    // Start MQTT (non-blocking — auto-reconnects in background)
    this.mqttClient = new MqttClientWrapper(this.pluginConfig.mqtt, this.log);
    this.mqttClient.start();

    // Register / restore accessories
    this.discoverAccessories();

    // Remove accessories that are no longer in config
    this.pruneStaleAccessories();

    this.log.info('GenericMqttPlatform started with %d accessory(ies)', this.pluginConfig.accessories.length);
  }

  // ---------------------------------------------------------------------------
  // Accessory discovery
  // ---------------------------------------------------------------------------

  private discoverAccessories(): void {
    for (const accConfig of this.pluginConfig.accessories) {
      const uuid = this.api.hap.uuid.generate(`generic-mqtt::${accConfig.id}`);
      this.activeUUIDs.add(uuid);

      const existing = this.cachedAccessories.get(uuid);

      if (existing) {
        this.log.info('Configuring cached accessory: %s (%s)', accConfig.name, accConfig.id);
        existing.context.config = accConfig;
        this.api.updatePlatformAccessories([existing]);
        new AccessoryHandler(this.log, this.api, this.mqttClient, existing, accConfig);
      } else {
        this.log.info('Adding new accessory: %s (%s)', accConfig.name, accConfig.id);
        const accessory = new this.api.platformAccessory(accConfig.name, uuid);
        accessory.context.config = accConfig;
        new AccessoryHandler(this.log, this.api, this.mqttClient, accessory, accConfig);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  private pruneStaleAccessories(): void {
    for (const [uuid, accessory] of this.cachedAccessories) {
      if (!this.activeUUIDs.has(uuid)) {
        this.log.info('Removing stale accessory: %s', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  private async shutdown(): Promise<void> {
    if (this.mqttClient) {
      await this.mqttClient.disconnect();
    }
  }
}
