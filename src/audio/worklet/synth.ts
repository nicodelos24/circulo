import { MODULE_ORDER, type ModuleId } from '../patch';
import type { FromWorklet, ToWorklet, VoicePatch } from '../protocol';
import { PingPongDelay } from './dsp/delayline';
import { CompressorEffect, MasterEffect } from './dsp/effects/dynamics';
import { ChorusEffect, DriveEffect, PhaserEffect, TremoloEffect } from './dsp/effects/modulators';
import { ReverbEffect } from './dsp/effects/reverb';
import { DEFAULT_VOICE_PARAMS, Voice, type VoiceParams } from './dsp/voice';

export const MAX_VOICES = 16;

export interface MeterReport {
  peak: number;
  rms: number;
  voices: number;
}

/**
 * Núcleo del sintetizador: voices -> cadena de efectos -> master.
 * Corre dentro del AudioWorklet, así que todo queda en el hilo de audio
 * sin la latencia que añadirían varios nodos de Web Audio en cascada.
 */
export class SynthEngine {
  private readonly pool: Voice[] = [];
  private readonly active: Voice[] = [];
  private drive = new DriveEffect();
  private chorus = new ChorusEffect();
  private phaser = new PhaserEffect();
  private tremolo = new TremoloEffect();
  private readonly delay = new PingPongDelay();
  private reverb = new ReverbEffect();
  private compressor = new CompressorEffect();
  private master = new MasterEffect();
  private clock = 0;
  private meterPeak = 0;
  private meterRms = 0;
  private delayParams = { time: 0.34, feedback: 0.42, tone: 0.5, mix: 0.32 };

  voiceParams: VoiceParams = { ...DEFAULT_VOICE_PARAMS };
  private readonly effectState: Record<string, boolean> = {};

  constructor() {
    for (let i = 0; i < MAX_VOICES; i += 1) {
      this.pool.push(new Voice(-1, 60, 0, { bend: 0, vibratoDepth: 0, vibratoRate: 5.5, pan: 0, pressure: 0.5 }));
    }
    for (const id of MODULE_ORDER) this.effectState[id] = true;
  }

  handle(message: ToWorklet): void {
    switch (message.type) {
      case 'noteOn':
        this.noteOn(message.id, message.midi, message.velocity, message.pan);
        break;
      case 'noteOff':
        this.noteOff(message.id);
        break;
      case 'allOff':
        this.allOff();
        break;
      case 'patch': {
        const voice = this.find(message.id);
        if (voice) voice.setPatch(message.patch);
        break;
      }
      case 'pan': {
        const voice = this.find(message.id);
        if (voice) voice.setPatch({ ...voice.patch, pan: message.pan });
        break;
      }
      case 'enable':
        this.setEffectEnabled(message.module, message.enabled);
        break;
      case 'param':
        this.setParam(message.module, message.id, message.value);
        break;
      default:
        break;
    }
  }

  setEffectEnabled(id: ModuleId, enabled: boolean): void {
    this.effectState[id] = enabled;
    switch (id) {
      case 'drive':
        this.drive.setEnabled(enabled);
        break;
      case 'chorus':
        this.chorus.setEnabled(enabled);
        break;
      case 'phaser':
        this.phaser.setEnabled(enabled);
        break;
      case 'tremolo':
        this.tremolo.setEnabled(enabled);
        break;
      case 'reverb':
        this.reverb.setEnabled(enabled);
        break;
      case 'compressor':
        this.compressor.setEnabled(enabled);
        break;
      default:
        break;
    }
  }

  isEnabled(id: ModuleId): boolean {
    return this.effectState[id] ?? true;
  }

  setParam(module: ModuleId, id: string, value: number): void {
    if (module === 'voice') {
      (this.voiceParams as unknown as Record<string, number>)[id] = value;
      return;
    }
    switch (module) {
      case 'drive':
        this.drive.setParam(id, value);
        break;
      case 'chorus':
        this.chorus.setParam(id, value);
        break;
      case 'phaser':
        this.phaser.setParam(id, value);
        break;
      case 'tremolo':
        this.tremolo.setParam(id, value);
        break;
      case 'delay':
        (this.delayParams as unknown as Record<string, number>)[id] = value;
        break;
      case 'reverb':
        this.reverb.setParam(id, value);
        break;
      case 'compressor':
        this.compressor.setParam(id, value);
        break;
      case 'master':
        this.master.setParam(id, value);
        break;
      default:
        break;
    }
  }

  private find(id: number): Voice | undefined {
    return this.active.find((voice) => voice.id === id);
  }

  /** Toma una voz del pool: primero las liberadas, luego la más vieja. */
  private allocate(): Voice {
    const finished = this.active.find((voice) => !voice.active);
    if (finished) {
      this.active.splice(this.active.indexOf(finished), 1);
      this.pool.push(finished);
    }
    const voice = this.pool.pop();
    if (!voice) {
      let oldest = this.active[0];
      for (const candidate of this.active) {
        if (candidate.startedAt < oldest.startedAt) oldest = candidate;
      }
      this.active.splice(this.active.indexOf(oldest), 1);
      return oldest;
    }
    return voice;
  }

  noteOn(id: number, midi: number, velocity: number, pan: number): void {
    const existing = this.find(id);
    if (existing) {
      existing.kill();
      this.active.splice(this.active.indexOf(existing), 1);
      this.pool.push(existing);
    }
    const voice = this.allocate();
    const patch: VoicePatch = { bend: 0, vibratoDepth: 0, vibratoRate: 5.5, pan, pressure: velocity };
    voice.start(id, midi, velocity, patch, this.clock);
    this.active.push(voice);
  }

  noteOff(id: number): void {
    this.find(id)?.release();
  }

  allOff(): void {
    for (const voice of this.active) {
      voice.kill();
      this.pool.push(voice);
    }
    this.active.length = 0;
  }

  get activeVoices(): number {
    return this.active.length;
  }

  /** Renderiza un bloque estéreo in-place y devuelve el nivel medido. */
  render(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): MeterReport {
    this.clock += 1;
    left.fill(0, 0, samples);
    right.fill(0, 0, samples);

    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const voice = this.active[i];
      const alive = voice.render(left, right, 0, samples, sampleRate, this.voiceParams);
      if (!alive) {
        this.active.splice(i, 1);
        this.pool.push(voice);
      }
    }

    this.drive.process(left, right, samples, sampleRate);
    this.chorus.process(left, right, samples, sampleRate);
    this.phaser.process(left, right, samples, sampleRate);
    this.tremolo.process(left, right, samples, sampleRate);
    if (this.effectState.delay) {
      this.delay.process(
        left,
        right,
        samples,
        this.delayParams.time,
        this.delayParams.feedback,
        this.delayParams.tone,
        this.delayParams.mix,
        sampleRate,
      );
    }
    this.reverb.process(left, right, samples, sampleRate);
    this.compressor.process(left, right, samples, sampleRate);
    this.master.process(left, right, samples, sampleRate);

    let peak = 0;
    let sum = 0;
    for (let i = 0; i < samples; i += 1) {
      const l = left[i];
      const r = right[i];
      const mag = Math.abs(l) > Math.abs(r) ? Math.abs(l) : Math.abs(r);
      if (mag > peak) peak = mag;
      sum += l * l + r * r;
    }
    const rms = Math.sqrt(sum / (samples * 2));
    this.meterPeak = Math.max(peak, this.meterPeak * 0.86);
    this.meterRms += (rms - this.meterRms) * 0.3;
    return { peak: this.meterPeak, rms: this.meterRms, voices: this.active.length };
  }

  meterReport(): FromWorklet {
    return { type: 'meter', peak: this.meterPeak, rms: this.meterRms, voices: this.active.length };
  }

  reset(): void {
    this.allOff();
    this.drive.reset();
    this.chorus.reset();
    this.phaser.reset();
    this.tremolo.reset();
    this.delay.reset();
    this.reverb.reset();
    this.compressor.reset();
    this.master.reset();
    this.meterPeak = 0;
    this.meterRms = 0;
  }
}
