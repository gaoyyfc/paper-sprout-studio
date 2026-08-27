import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const sampleRate = 44100;
const durationSeconds = 42;
const channels = 1;
const totalSamples = sampleRate * durationSeconds;
const outputPath = resolve('public/audio/paper-sprout-playful.wav');
const samples = new Float64Array(totalSamples);

let seed = 20260821;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff * 2 - 1;
};

const noteFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const addTone = (start, duration, midi, gain, voice = 'pluck') => {
  const startSample = Math.floor(start * sampleRate);
  const length = Math.floor(duration * sampleRate);
  const frequency = noteFrequency(midi);
  for (let i = 0; i < length && startSample + i < samples.length; i += 1) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.018);
    const release = Math.min(1, (duration - t) / 0.12);
    const decay = voice === 'pluck' ? Math.exp(-t * 4.8) : 0.72 + Math.exp(-t * 1.8) * 0.28;
    const envelope = Math.max(0, attack * release * decay);
    const phase = Math.PI * 2 * frequency * t;
    const timbre = voice === 'bass'
      ? Math.sin(phase) * 0.82 + Math.sin(phase * 2) * 0.18
      : Math.sin(phase) * 0.68 + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.1;
    samples[startSample + i] += timbre * envelope * gain;
  }
};

const addPercussion = (start, duration, gain, kind) => {
  const startSample = Math.floor(start * sampleRate);
  const length = Math.floor(duration * sampleRate);
  for (let i = 0; i < length && startSample + i < samples.length; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * (kind === 'kick' ? 15 : 28));
    const signal = kind === 'kick'
      ? Math.sin(Math.PI * 2 * (92 - t * 42) * t)
      : noise() * 0.75 + Math.sin(Math.PI * 2 * 3100 * t) * 0.25;
    samples[startSample + i] += signal * envelope * gain;
  }
};

const beat = 60 / 108;
const melody = [72, 76, 79, 76, 74, 77, 81, 77, 72, 74, 76, 79, 77, 76, 74, 72];
const bass = [48, 48, 53, 55, 48, 48, 55, 53];
const beats = Math.ceil(durationSeconds / beat);

for (let index = 0; index < beats; index += 1) {
  const at = index * beat;
  const phrase = Math.floor(index / 16);
  const note = melody[(index + phrase * 3) % melody.length];
  addTone(at, beat * 0.82, note, index % 4 === 0 ? 0.12 : 0.095, 'pluck');
  if (index % 2 === 1) addTone(at + beat * 0.5, beat * 0.34, note + 12, 0.035, 'pluck');
  if (index % 4 === 0) addTone(at, beat * 3.7, bass[(index / 4) % bass.length], 0.055, 'bass');
  addPercussion(at, 0.18, index % 4 === 0 ? 0.075 : 0.04, index % 2 === 0 ? 'kick' : 'shaker');
  if (index % 2 === 1) addPercussion(at + beat * 0.5, 0.1, 0.022, 'shaker');
}

const pcm = Buffer.alloc(totalSamples * 2);
for (let i = 0; i < totalSamples; i += 1) {
  const fadeIn = Math.min(1, i / (sampleRate * 0.45));
  const fadeOut = Math.min(1, (totalSamples - i) / (sampleRate * 1.2));
  const value = Math.tanh(samples[i] * 1.35) * fadeIn * fadeOut;
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(channels, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * channels * 2, 28);
header.writeUInt16LE(channels * 2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, Buffer.concat([header, pcm]));
process.stdout.write(`${outputPath}\n`);
