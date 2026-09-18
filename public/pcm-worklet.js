class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {const input=inputs[0];if(input?.[0]){const data=new Float32Array(input[0].length);for(let c=0;c<input.length;c++)for(let i=0;i<data.length;i++)data[i]+=input[c][i]/input.length;this.port.postMessage(data,[data.buffer]);}return true;}
}
registerProcessor('pcm-capture',CaptureProcessor);
