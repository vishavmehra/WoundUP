/** A recording stand-in for the Web Audio API: enough surface for src/audio, nothing played. */
export class FakeParam {
  value = 0;
  readonly ramps: number[] = [];
  setValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number): this {
    this.ramps.push(v);
    return this;
  }
  exponentialRampToValueAtTime(v: number): this {
    this.ramps.push(v);
    return this;
  }
  setTargetAtTime(v: number): this {
    this.value = v;
    return this;
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  readonly gain = new FakeParam();
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  readonly threshold = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
  type = '';
  buffer: unknown = null;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor(readonly kind: string) {}
  connect(to: FakeNode): FakeNode {
    this.outputs.push(to);
    return to;
  }
  start(at: number): void {
    this.startedAt = at;
  }
  stop(at: number): void {
    this.stoppedAt = at;
  }
}

export class FakeAudioContext {
  readonly sampleRate = 8000;
  currentTime = 0;
  state: 'suspended' | 'running' = 'suspended';
  resumed = 0;
  readonly destination = new FakeNode('destination');
  readonly nodes: FakeNode[] = [];
  private make(kind: string): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
  createGain = (): FakeNode => this.make('gain');
  createOscillator = (): FakeNode => this.make('oscillator');
  createBiquadFilter = (): FakeNode => this.make('filter');
  createBufferSource = (): FakeNode => this.make('source');
  createDynamicsCompressor = (): FakeNode => this.make('compressor');
  createBuffer = (_channels: number, length: number): { length: number; getChannelData(): Float32Array } => {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  };
  resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  /** Every oscillator and noise source that was started but never given a stop time: a leak. */
  leaks(): FakeNode[] {
    return this.nodes.filter((n) => (n.kind === 'oscillator' || n.kind === 'source') && n.startedAt !== null && n.stoppedAt === null);
  }
  ofKind(kind: string): FakeNode[] {
    return this.nodes.filter((n) => n.kind === kind);
  }
}

export const asContext = (c: FakeAudioContext): AudioContext => c as unknown as AudioContext;
