class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 64000; // ~4s at 16kHz
    this._buffer = new Float32Array(this._bufferSize);
    this._writePos = 0;
    this._readPos = 0;
    this._samplesAvailable = 0;

    this.port.onmessage = (event) => {
      const samples = event.data;
      for (let i = 0; i < samples.length; i++) {
        this._buffer[this._writePos] = samples[i];
        this._writePos = (this._writePos + 1) % this._bufferSize;
      }
      this._samplesAvailable = Math.min(
        this._samplesAvailable + samples.length,
        this._bufferSize
      );
    };
  }

  process(inputs, outputs) {
    const channel = outputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      if (this._samplesAvailable > 0) {
        channel[i] = this._buffer[this._readPos];
        this._readPos = (this._readPos + 1) % this._bufferSize;
        this._samplesAvailable--;
      } else {
        channel[i] = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-player-processor", PCMPlayerProcessor);
