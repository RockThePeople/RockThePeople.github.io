const mining = async (inputdifficulty) => {

  //GPU 가용여부 확인
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { return; }
  const device = await adapter.requestDevice();

  const returnObejct = [];
  //난이도 세팅

  const fromHexString = (hexString) => Uint32Array.from((hexString.split("").map(e => e.charCodeAt(0))));

  // const setDifficulty = (difficultyDigits) => {
  //   const hashLength = 64;
  //   let target = "";
  //   for (let i = 0; i < difficultyDigits; i++) { target += '0' }
  //   target += 'F'.repeat(hashLength - difficultyDigits);
  //   return fromHexString(target);
  // };

  const setDifficulty = (difficultyDigits) => {
    const hashLength = 64;
    let target = "";
    for (let i = 0; i < difficultyDigits; i++) { target += '0' }
    target += 'F'.repeat(hashLength - difficultyDigits);
    //let converted = fromHexString(target);
    return new Uint32Array(target.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  };

  const generateRandomHash = () => {
    const array = new Uint8Array(64);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const difficulty = setDifficulty(inputdifficulty);
  console.log(difficulty);
  let result = "";
  let k = 0;
  for (let value of Array.from(new Uint32Array(difficulty))) {
    result += value.toString(16).toUpperCase();
    k++
  }
  returnObejct.push(`Difficulty (byte-len : ${k}): ${result}`)
  // 밥먹고 와서 이거 전달하는거 짜기

  //기본 데이터셋 생성
  const previousBlockHash = generateRandomHash(); // len = 128
  const merkleRoot = generateRandomHash();
  const timestamp = Math.floor(Date.now() / 1000).toString(16); // len = 8
  const blockheader = (`${previousBlockHash}${merkleRoot}${timestamp}`).toUpperCase(); // len = 264
  returnObejct.push(`Block Header : ${blockheader}`);
  const baseHashArray = fromHexString(blockheader);

  const gpuBufferbaseHashArray = device.createBuffer({
    mappedAtCreation: true,
    size: baseHashArray.byteLength,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrayBufferbaseHashArray = gpuBufferbaseHashArray.getMappedRange();
  // buffer size : 4 byte / string
  new Int32Array(arrayBufferbaseHashArray).set(baseHashArray);
  gpuBufferbaseHashArray.unmap();

  // 위에 fromHexString 하면 몇조각으로 쪼개졌는지 ? 
  // blockcheader의 경우 18조각으로 컷
  const size = new Uint32Array([inputdifficulty]);

  // 여기서부터 Buffer settings
  // gpuBuffer
  const difficultySize = device.createBuffer({
    mappedAtCreation: true,
    size: 4,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrayBufferSize = difficultySize.getMappedRange();
  new Int32Array(arrayBufferSize).set(size);
  // 이렇게 세팅 해줘야함. 멋대로 4바이트 단위로 해야되고, 32 Int array 사용하는 것으로 맞춰서 difficultySize에 넣어야함
  difficultySize.unmap();

  const gpuBufferDifficulty = device.createBuffer({
    mappedAtCreation: true,
    size: difficulty.byteLength,
    usage: GPUBufferUsage.STORAGE,
  });

  const arrayBufferDifficulty = gpuBufferDifficulty.getMappedRange();
  new Int32Array(arrayBufferDifficulty).set(difficulty);
  gpuBufferDifficulty.unmap();

  const resultHashBufferSize = Uint32Array.BYTES_PER_ELEMENT * 32; // 원래 32 -> nonce 때매 33
  const resultHashBuffer = device.createBuffer({
    size: resultHashBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });

  const resultNonceBufferSize = Uint32Array.BYTES_PER_ELEMENT * 10; // 원래 32 -> nonce 때매 33
  const resultNonceBuffer = device.createBuffer({
    size: resultNonceBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });

  const flagBuffer = device.createBuffer({
    mappedAtCreation: true,
    size: Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });
  const arrayBufferFlag = flagBuffer.getMappedRange();
  new Uint32Array(arrayBufferFlag).set([0]); // 초기 값은 0으로 설정
  flagBuffer.unmap();

  // 여기서 부터 GroupBining, Layout  setting
  const bindGroupLayout = (device).createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" }
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" }
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" }
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" }
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" }
      }
    ]
  });

  // Layout 바탕으로 binding group 생성, 버퍼 사이즈도 다 세팅해줘야함. 필수
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: gpuBufferbaseHashArray } },
      { binding: 1, resource: { buffer: difficultySize } },
      { binding: 2, resource: { buffer: gpuBufferDifficulty } },
      { binding: 3, resource: { buffer: resultHashBuffer } },
      { binding: 4, resource: { buffer: resultNonceBuffer } },
      { binding: 5, resource: { buffer: flagBuffer } }
    ]
  });

  const shaderModule = device.createShaderModule({
    code: sha256Shader
    // shader code로 세팅
  });

  // 이렇게 파이프라인 짤때도 bindgroupLayout으로 짜야함
  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    }),
    compute: {
      module: shaderModule,
      entryPoint: "main"
    }
  });

  // 코멘드 인코더 세팅
  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();

  const start = performance.now();

  // 파이프라인 만들고, 바인딩한거 세팅하고
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);

  // 워크그룹 만들어 디스패칭. 여기  체크하고 넘어갈 것
  passEncoder.dispatchWorkgroups(8, 8, 1);
  passEncoder.end();

  const gpuReadBuffer = device.createBuffer({
    size: resultHashBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  const gpuNonceReadBuffer = device.createBuffer({
    size: resultNonceBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  const flagReadBuffer = device.createBuffer({
    size: Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  commandEncoder.copyBufferToBuffer(
    resultHashBuffer, 0, gpuReadBuffer, 0, resultHashBufferSize
  );

  commandEncoder.copyBufferToBuffer(
    resultNonceBuffer, 0, gpuNonceReadBuffer, 0, resultNonceBufferSize
  );

  commandEncoder.copyBufferToBuffer(
    flagBuffer, 0, flagReadBuffer, 0, Uint32Array.BYTES_PER_ELEMENT
  );

  const gpuCommands = commandEncoder.finish();
  device.queue.submit([gpuCommands]);

  await gpuReadBuffer.mapAsync(GPUMapMode.READ);
  const hashBuffer = await gpuReadBuffer.getMappedRange();

  await gpuNonceReadBuffer.mapAsync(GPUMapMode.READ);
  const nonceBuffer = await gpuNonceReadBuffer.getMappedRange();

  await flagReadBuffer.mapAsync(GPUMapMode.READ);
  const flag = new Uint32Array(flagReadBuffer.getMappedRange())[0];

  const end = performance.now();

  if (flag === 1) {
    let hash = "";
    let i = 0;
    for (let value of Array.from(new Uint32Array(hashBuffer))) {
      hash += value.toString(16);
      i++;
    }

    let nonce = "";
    let j = 0;
    for (let value of Array.from(new Uint32Array(nonceBuffer))) {
      nonce += value.toString(10);
      j++;
    }

    returnObejct.push(`Final nonce (byte-len : ${j}) : ${nonce}`);
    returnObejct.push(`Hash result (byte-len : ${i}): ${hash.toUpperCase()}`);
  } else {
    returnObejct.push('No valid nonce found.');
  }

  returnObejct.push(`Operation time (sec) : ${(end - start) / 1000}`);
  console.log(new Uint32Array(hashBuffer))
  const returnHTML = `
  <ul>
    ${returnObejct.map((data, idx) => `<li key=${idx}>${data}</li><br/>`).join('')}
  </ul>`;

  return returnHTML;
}
