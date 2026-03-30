import type { Logging } from 'homebridge';
import type { GenericMqttPlatformConfig, AccessoryConfig, ServiceConfig } from './config.js';

/**
 * Validates the platform config at startup and logs clear error messages.
 * Returns true if the config is valid enough to proceed.
 */
export function validateConfig(config: GenericMqttPlatformConfig, log: Logging): boolean {
  let valid = true;

  // MQTT block
  if (!config.mqtt) {
    log.error('Config validation: "mqtt" block is required');
    return false;
  }
  if (!config.mqtt.url || typeof config.mqtt.url !== 'string') {
    log.error('Config validation: "mqtt.url" is required and must be a string');
    return false;
  }

  // Accessories array
  if (!Array.isArray(config.accessories) || config.accessories.length === 0) {
    log.error('Config validation: "accessories" must be a non-empty array');
    return false;
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < config.accessories.length; i++) {
    const acc: AccessoryConfig = config.accessories[i];

    if (!acc.id || typeof acc.id !== 'string') {
      log.error('Config validation: accessories[%d] is missing a valid "id"', i);
      valid = false;
      continue;
    }
    if (seenIds.has(acc.id)) {
      log.error('Config validation: duplicate accessory id "%s"', acc.id);
      valid = false;
    }
    seenIds.add(acc.id);

    if (!acc.name || typeof acc.name !== 'string') {
      log.error('Config validation: accessories[%d] ("%s") is missing a "name"', i, acc.id);
      valid = false;
    }

    if (!Array.isArray(acc.services) || acc.services.length === 0) {
      log.error('Config validation: accessories[%d] ("%s") must have at least one service', i, acc.id);
      valid = false;
      continue;
    }

    for (let j = 0; j < acc.services.length; j++) {
      const svc: ServiceConfig = acc.services[j];
      if (!svc.type || typeof svc.type !== 'string') {
        log.error('Config validation: accessories[%d].services[%d] is missing "type"', i, j);
        valid = false;
      }
      if (!svc.name || typeof svc.name !== 'string') {
        log.error('Config validation: accessories[%d].services[%d] is missing "name"', i, j);
        valid = false;
      }
      if (!svc.characteristics || typeof svc.characteristics !== 'object' || Object.keys(svc.characteristics).length === 0) {
        log.error('Config validation: accessories[%d].services[%d] ("%s") must have at least one characteristic', i, j, svc.name ?? svc.type);
        valid = false;
      }
    }
  }

  return valid;
}
