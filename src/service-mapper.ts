import type { Service as ServiceType, WithUUID } from 'homebridge';

export type ServiceConstructor = WithUUID<typeof ServiceType>;

/**
 * Maps configuration service type strings to HAP Service constructors.
 *
 * Extension point: add entries here to support additional HomeKit services.
 * Every key must correspond to a static property on `hap.Service`.
 */
export function resolveServiceConstructor(
  Service: typeof ServiceType,
  typeName: string,
): ServiceConstructor | undefined {
  const map: Record<string, ServiceConstructor> = {
    // Sensors
    'HumiditySensor': Service.HumiditySensor,
    'TemperatureSensor': Service.TemperatureSensor,
    'ContactSensor': Service.ContactSensor,
    'LeakSensor': Service.LeakSensor,
    'MotionSensor': Service.MotionSensor,
    'OccupancySensor': Service.OccupancySensor,

    // Actuators
    'Switch': Service.Switch,
    'Valve': Service.Valve,

    // Battery
    'Battery': Service.Battery,
    'BatteryService': Service.Battery,
  };

  return map[typeName];
}
