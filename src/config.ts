import type { PlatformConfig } from 'homebridge';

// ---------------------------------------------------------------------------
// MQTT broker configuration
// ---------------------------------------------------------------------------

export interface MqttConfig {
  /** MQTT broker URL, e.g. "mqtt://localhost:1883" */
  url: string;
  /** Optional username for broker authentication */
  username?: string;
  /** Optional password for broker authentication */
  password?: string;
  /** Optional MQTT client ID — auto-generated if omitted */
  clientId?: string;
  /** Base topic prefix prepended to all topics (e.g. "home/") */
  baseTopic?: string;
  /** Keep-alive interval in seconds (default: 60) */
  keepalive?: number;
  /** QoS level for subscriptions (default: 0) */
  qos?: 0 | 1 | 2;
}

// ---------------------------------------------------------------------------
// Characteristic configuration
// ---------------------------------------------------------------------------

export interface CharacteristicConfig {
  /** MQTT topic to subscribe to for reading this characteristic */
  getTopic?: string;
  /** MQTT topic to publish to when HomeKit writes this characteristic */
  setTopic?: string;
  /** Value mapping for boolean/active characteristics */
  onValue?: string;
  /** Value mapping for boolean/active characteristics */
  offValue?: string;
  /**
   * Optional JSON key path to extract from the MQTT payload.
   * Supports dot-separated paths like "data.temperature".
   */
  jsonPath?: string;
  /** Default value to use before any MQTT message is received */
  defaultValue?: number | string | boolean;
  /**
   * Minimum interval (ms) between updates pushed to HomeKit.
   * Useful for noisy sensors. Default: 0 (no debounce).
   */
  debounce?: number;
  /** Multiply the incoming numeric value by this factor (e.g. 0.01 to convert basis points to %) */
  scale?: number;
  /** Offset to add after scaling */
  offset?: number;
  /** Clamp the final value to this minimum */
  minValue?: number;
  /** Clamp the final value to this maximum */
  maxValue?: number;
}

// ---------------------------------------------------------------------------
// Service configuration
// ---------------------------------------------------------------------------

export interface ServiceConfig {
  /**
   * HomeKit service type name (e.g. "Switch", "HumiditySensor", "Valve").
   * Must match one of the supported service names in the service mapper.
   */
  type: string;
  /** Display name for this service in HomeKit */
  name: string;
  /**
   * Optional subtype identifier. Required when an accessory exposes
   * multiple services of the same type.
   */
  subtype?: string;
  /** Whether MQTT messages published by this service use the retain flag (default: false) */
  retain?: boolean;
  /** Map of characteristic name → characteristic config */
  characteristics: Record<string, CharacteristicConfig>;
}

// ---------------------------------------------------------------------------
// Accessory configuration
// ---------------------------------------------------------------------------

export interface AccessoryConfig {
  /** Unique stable identifier for this accessory (used for UUID generation) */
  id: string;
  /** Display name shown in HomeKit */
  name: string;
  /** Optional manufacturer string for AccessoryInformation */
  manufacturer?: string;
  /** Optional model string for AccessoryInformation */
  model?: string;
  /** Optional serial number for AccessoryInformation */
  serialNumber?: string;
  /** Optional firmware revision */
  firmwareRevision?: string;
  /**
   * Optional MQTT topic whose payload indicates device availability.
   * Expected payloads: "online" / "offline" (configurable).
   */
  availabilityTopic?: string;
  /** Payload that means the device is online (default: "online") */
  availabilityOnline?: string;
  /** Payload that means the device is offline (default: "offline") */
  availabilityOffline?: string;
  /** List of HomeKit services exposed by this accessory */
  services: ServiceConfig[];
}

// ---------------------------------------------------------------------------
// Full platform config
// ---------------------------------------------------------------------------

export interface GenericMqttPlatformConfig extends PlatformConfig {
  mqtt: MqttConfig;
  accessories: AccessoryConfig[];
}
