import type { Characteristic as CharacteristicType, WithUUID } from 'homebridge';

export type CharacteristicConstructor = WithUUID<new () => CharacteristicType>;

/**
 * Maps configuration characteristic names to HAP Characteristic constructors.
 *
 * Extension point: add entries here to support additional characteristics.
 * Every key must correspond to a static property on `hap.Characteristic`.
 */
export function resolveCharacteristicConstructor(
  Characteristic: typeof CharacteristicType,
  name: string,
): CharacteristicConstructor | undefined {
  const map: Record<string, CharacteristicConstructor> = {
    // Sensor readings
    'CurrentRelativeHumidity': Characteristic.CurrentRelativeHumidity,
    'CurrentTemperature': Characteristic.CurrentTemperature,
    'ContactSensorState': Characteristic.ContactSensorState,
    'LeakDetected': Characteristic.LeakDetected,
    'MotionDetected': Characteristic.MotionDetected,
    'OccupancyDetected': Characteristic.OccupancyDetected,

    // Battery
    'BatteryLevel': Characteristic.BatteryLevel,
    'StatusLowBattery': Characteristic.StatusLowBattery,
    'ChargingState': Characteristic.ChargingState,

    // Switch
    'On': Characteristic.On,

    // Valve / Irrigation
    'Active': Characteristic.Active,
    'InUse': Characteristic.InUse,
    'ValveType': Characteristic.ValveType,
    'SetDuration': Characteristic.SetDuration,
    'RemainingDuration': Characteristic.RemainingDuration,

    // Generic status (useful on any service)
    'StatusActive': Characteristic.StatusActive,
    'StatusFault': Characteristic.StatusFault,
    'Name': Characteristic.Name,
  };

  return map[name];
}
