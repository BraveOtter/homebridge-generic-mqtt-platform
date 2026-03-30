# homebridge-generic-mqtt-platform

A **generic, extensible Homebridge dynamic platform plugin** that bridges MQTT topics to HomeKit services and characteristics. Define your accessories entirely through configuration — no code changes needed.

## Features

- **Config-driven** — define accessories, services, and characteristics in JSON
- **Multi-service** — a single accessory can expose multiple HomeKit services (e.g. humidity sensor + battery + valve)
- **MQTT read/write** — subscribe to topics for state, publish to topics for control
- **Value mapping** — configurable ON/OFF payloads, JSON path extraction, scale, offset, clamping
- **State caching** — in-memory state so HomeKit gets instant responses even when devices are asleep (ideal for battery-powered ESP32 devices)
- **Debounce** — optional per-characteristic rate limiting for noisy sensors
- **Availability** — optional online/offline tracking via MQTT topic
- **Clean lifecycle** — proper accessory caching, restoration, and pruning of stale accessories
- **Extensible** — add new service/characteristic types by adding a single line to the mapper

## Supported Service Types

| Config Value | HomeKit Service |
|---|---|
| `HumiditySensor` | Humidity Sensor |
| `TemperatureSensor` | Temperature Sensor |
| `ContactSensor` | Contact Sensor |
| `LeakSensor` | Leak Sensor |
| `LightSensor` | Light Sensor |
| `MotionSensor` | Motion Sensor |
| `OccupancySensor` | Occupancy Sensor |
| `SmokeSensor` | Smoke Sensor |
| `CarbonDioxideSensor` | Carbon Dioxide Sensor |
| `CarbonMonoxideSensor` | Carbon Monoxide Sensor |
| `AirQualitySensor` | Air Quality Sensor |
| `Switch` | Switch |
| `Outlet` | Outlet |
| `Valve` | Valve |
| `Fanv2` | Fan v2 |
| `Lightbulb` | Lightbulb |
| `GarageDoorOpener` | Garage Door Opener |
| `LockMechanism` | Lock Mechanism |
| `WindowCovering` | Window Covering |
| `Window` | Window |
| `Door` | Door |
| `Thermostat` | Thermostat |
| `IrrigationSystem` | Irrigation System |
| `Battery` / `BatteryService` | Battery |
| `StatelessProgrammableSwitch` | Stateless Programmable Switch |

## Installation

### From npm (when published)

```bash
npm install -g homebridge-generic-mqtt-platform
```

### Local development

```bash
git clone <repo-url>
cd homebridge-generic-mqtt-platform
npm install
npm run build
npm link
```

Then in your Homebridge installation directory:

```bash
npm link homebridge-generic-mqtt-platform
```

## Configuration

Add to your Homebridge `config.json` under `platforms`:

```json
{
  "platform": "GenericMqttPlatform",
  "name": "Generic MQTT Platform",
  "mqtt": {
    "url": "mqtt://mosquitto.homekit.svc.cluster.local:1883",
    "username": "user",
    "password": "pass",
    "baseTopic": "",
    "keepalive": 60,
    "qos": 0
  },
  "accessories": [
    {
      "id": "plant1",
      "name": "Plant 1",
      "manufacturer": "DIY",
      "model": "ESP32-C6 Sensor",
      "serialNumber": "PLT-001",
      "availabilityTopic": "irrigation/plant1/availability",
      "services": [
        {
          "type": "HumiditySensor",
          "name": "Soil Humidity",
          "characteristics": {
            "CurrentRelativeHumidity": {
              "getTopic": "irrigation/plant1/humidity",
              "defaultValue": 0,
              "minValue": 0,
              "maxValue": 100
            }
          }
        },
        {
          "type": "TemperatureSensor",
          "name": "Temperature",
          "characteristics": {
            "CurrentTemperature": {
              "getTopic": "irrigation/plant1/temperature",
              "defaultValue": 20
            }
          }
        },
        {
          "type": "Battery",
          "name": "Battery",
          "characteristics": {
            "BatteryLevel": {
              "getTopic": "irrigation/plant1/battery",
              "defaultValue": 100
            },
            "StatusLowBattery": {
              "getTopic": "irrigation/plant1/batteryLow",
              "defaultValue": 0
            },
            "ChargingState": {
              "defaultValue": 2
            }
          }
        },
        {
          "type": "Valve",
          "name": "Irrigation",
          "characteristics": {
            "Active": {
              "getTopic": "irrigation/plant1/pump/state",
              "setTopic": "irrigation/plant1/pump/set",
              "onValue": "ON",
              "offValue": "OFF",
              "defaultValue": 0
            },
            "InUse": {
              "getTopic": "irrigation/plant1/pump/state",
              "onValue": "ON",
              "offValue": "OFF",
              "defaultValue": 0
            },
            "ValveType": {
              "defaultValue": 1
            }
          }
        }
      ]
    },
    {
      "id": "water-tank",
      "name": "Water Tank",
      "services": [
        {
          "type": "HumiditySensor",
          "name": "Water Level",
          "characteristics": {
            "CurrentRelativeHumidity": {
              "getTopic": "tank/level",
              "jsonPath": "data.level",
              "defaultValue": 50,
              "debounce": 5000
            }
          }
        },
        {
          "type": "LeakSensor",
          "name": "Low Level Alert",
          "characteristics": {
            "LeakDetected": {
              "getTopic": "tank/lowLevel",
              "onValue": "true",
              "offValue": "false",
              "defaultValue": 0
            }
          }
        }
      ]
    },
    {
      "id": "relay1",
      "name": "Relay Module",
      "services": [
        {
          "type": "Switch",
          "name": "Channel 1",
          "subtype": "ch1",
          "characteristics": {
            "On": {
              "getTopic": "devices/relay1/ch1/state",
              "setTopic": "devices/relay1/ch1/set",
              "onValue": "ON",
              "offValue": "OFF"
            }
          }
        },
        {
          "type": "Switch",
          "name": "Channel 2",
          "subtype": "ch2",
          "characteristics": {
            "On": {
              "getTopic": "devices/relay1/ch2/state",
              "setTopic": "devices/relay1/ch2/set",
              "onValue": "ON",
              "offValue": "OFF"
            }
          }
        }
      ]
    }
  ]
}
```

## Characteristic Options

Each characteristic entry supports:

| Property | Type | Description |
|---|---|---|
| `getTopic` | string | MQTT topic to subscribe for reading |
| `setTopic` | string | MQTT topic to publish when HomeKit writes |
| `onValue` | string | Payload that means ON / true / active (e.g. `"ON"`) |
| `offValue` | string | Payload that means OFF / false / inactive (e.g. `"OFF"`) |
| `jsonPath` | string | Dot-separated path to extract from a JSON payload (e.g. `"data.temperature"`) |
| `defaultValue` | any | Initial value before any MQTT message is received |
| `debounce` | number | Minimum interval (ms) between HomeKit updates |
| `scale` | number | Multiply incoming value by this factor |
| `offset` | number | Add to value after scaling |
| `minValue` | number | Clamp minimum |
| `maxValue` | number | Clamp maximum |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode (requires homebridge in PATH and test config)
npm run watch

# Lint
npm run lint
```

## Architecture

```
src/
├── index.ts                  # Plugin entry — registers the platform
├── settings.ts               # Plugin name and platform name constants
├── config.ts                 # TypeScript interfaces for the config
├── config-validator.ts       # Config validation with clear error messages
├── platform.ts               # DynamicPlatformPlugin — MQTT connect + accessory lifecycle
├── accessory-handler.ts      # Wires a single accessory's services/characteristics to MQTT
├── mqtt-client.ts            # MQTT client wrapper (connect, subscribe, publish)
├── service-mapper.ts         # Config string → HAP Service constructor mapping
└── characteristic-mapper.ts  # Config string → HAP Characteristic constructor mapping
```

### Extension points

- **Add a new service type**: add one entry to `service-mapper.ts`
- **Add a new characteristic**: add one entry to `characteristic-mapper.ts`
- **Custom value transforms**: extend `decodeValue` / `encodeValue` in `accessory-handler.ts`

## Design Decisions

- **State caching**: All characteristic values are stored in memory so HomeKit receives immediate responses even when battery-powered devices are sleeping. The last MQTT message is always the authoritative state.
- **No hardcoded device logic**: The plugin does not know about "plants", "pumps", or "tanks" — it only knows about HomeKit services, characteristics, and MQTT topics.
- **Graceful degradation**: If MQTT is disconnected, previously cached state is still served. Reconnection is automatic.

## Limitations & Future Improvements

- **Retained messages**: The plugin subscribes on connect; retained messages from the broker are received automatically. No explicit "get on connect" polling is implemented yet.
- **Wildcard topics**: MQTT wildcard subscriptions (`+`, `#`) are not supported. Each characteristic maps to exactly one topic.
- **Payload transforms**: Only linear transforms (scale + offset) and JSON path extraction are supported. A future version could support expression-based or template-based transforms.
- **Topic templates**: Topics are configured per-characteristic. A future version could support `{{id}}` templates to reduce config repetition.
- **Polling fallback**: Not implemented. Could be added for devices that do not publish retained messages.
- **Last seen timestamp**: Not tracked yet. Could be exposed as a custom characteristic or logged.
- **Multiple platforms**: The schema is set as `singular: true`. If multiple MQTT brokers are needed, this could be changed to support multiple platform instances.

## License

Apache-2.0
