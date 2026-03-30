import type { Logging } from 'homebridge';
import mqtt, { type MqttClient, type IClientOptions } from 'mqtt';
import type { MqttConfig } from './config.js';

type MessageCallback = (topic: string, payload: string) => void;

/**
 * Thin wrapper around the mqtt.js client that manages connection lifecycle,
 * topic subscriptions, and message dispatch.
 */
export class MqttClientWrapper {
  private client: MqttClient | undefined;
  private subscriptions = new Map<string, Set<MessageCallback>>();
  private connected = false;

  constructor(
    private readonly mqttConfig: MqttConfig,
    private readonly log: Logging,
  ) {}

  /**
   * Start the MQTT connection. The client auto-reconnects in the background,
   * so this method never rejects — the plugin keeps running even when the
   * broker is temporarily unavailable (common in Docker/k3s startup order).
   */
  start(): void {
    const opts: IClientOptions = {
      clientId: this.mqttConfig.clientId ?? `homebridge-mqtt-${Math.random().toString(16).slice(2, 10)}`,
      username: this.mqttConfig.username,
      password: this.mqttConfig.password,
      keepalive: this.mqttConfig.keepalive ?? 60,
      reconnectPeriod: 5000,
      connectTimeout: 30_000,
      clean: true,
    };

    this.client = mqtt.connect(this.mqttConfig.url, opts);

    this.client.on('connect', () => {
      this.connected = true;
      this.log.info('MQTT connected to %s', this.mqttConfig.url);
      // Re-subscribe to all registered topics after (re)connect
      for (const topic of this.subscriptions.keys()) {
        this.client!.subscribe(topic, { qos: this.mqttConfig.qos ?? 0 });
      }
    });

    this.client.on('reconnect', () => {
      this.log.debug('MQTT reconnecting...');
    });

    this.client.on('offline', () => {
      this.connected = false;
      this.log.warn('MQTT offline');
    });

    this.client.on('error', (err) => {
      this.log.error('MQTT error: %s', err.message);
    });

    this.client.on('close', () => {
      this.connected = false;
      this.log.debug('MQTT connection closed');
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      const message = payload.toString('utf-8');
      this.dispatch(topic, message);
    });

    this.log.info('MQTT client started (broker: %s)', this.mqttConfig.url);
  }

  /** Subscribe to a topic and register a callback. */
  subscribe(topic: string, callback: MessageCallback): void {
    const fullTopic = this.resolveTopic(topic);
    let callbacks = this.subscriptions.get(fullTopic);
    if (!callbacks) {
      callbacks = new Set();
      this.subscriptions.set(fullTopic, callbacks);
      if (this.client && this.connected) {
        this.client.subscribe(fullTopic, { qos: this.mqttConfig.qos ?? 0 }, (err) => {
          if (err) {
            this.log.error('MQTT subscribe error for "%s": %s', fullTopic, err.message);
          } else {
            this.log.debug('MQTT subscribed to "%s"', fullTopic);
          }
        });
      }
    }
    callbacks.add(callback);
  }

  /** Publish a message to a topic. */
  publish(topic: string, payload: string): void {
    const fullTopic = this.resolveTopic(topic);
    if (!this.client || !this.connected) {
      this.log.warn('MQTT not connected — cannot publish to "%s"', fullTopic);
      return;
    }
    this.client.publish(fullTopic, payload, { qos: this.mqttConfig.qos ?? 0, retain: false }, (err) => {
      if (err) {
        this.log.error('MQTT publish error for "%s": %s', fullTopic, err.message);
      } else {
        this.log.debug('MQTT published "%s" → "%s"', fullTopic, payload);
      }
    });
  }

  /** Gracefully disconnect from the broker. */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.log.info('MQTT disconnecting...');
      await this.client.endAsync();
      this.connected = false;
    }
  }

  /** Whether the client is currently connected. */
  get isConnected(): boolean {
    return this.connected;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Prepend baseTopic if configured. */
  private resolveTopic(topic: string): string {
    if (this.mqttConfig.baseTopic) {
      const base = this.mqttConfig.baseTopic.replace(/\/+$/, '');
      return `${base}/${topic}`;
    }
    return topic;
  }

  /** Dispatch an incoming message to all matching callbacks. */
  private dispatch(topic: string, message: string): void {
    const callbacks = this.subscriptions.get(topic);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(topic, message);
        } catch (err) {
          this.log.error('Error in MQTT callback for "%s": %s', topic, (err as Error).message);
        }
      }
    }
  }
}
