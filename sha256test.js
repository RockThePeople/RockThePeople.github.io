const fromHexString = (hexString) => Uint32Array.from((hexString.split("").map(e => e.charCodeAt(0))));

const setDifficulty = (difficultyDigits) => {
  const hashLength = 64;
  let target = [];
  for (let i = 0; i < difficultyDigits; i++) { target.push('0') }
  for (let i = difficultyDigits; i < hashLength; i++) { target.push('F') }
  console.log(target)
  return target;
};
const u32Arr_to_hexArr = (value) => {
  let hexString = value.toString(16);
  if (hexString.length < 2) {
    hexString = '0' + hexString;
  }
  return hexString;
}
const generateRandomHash = (difficultyDigits) => {
  const charset = '0123456789ABCDEF';
  let randomArray = "";
  for (let i = 0; i < difficultyDigits; i++) { randomArray += '0' }
  for (let i = 0; i < (64 - difficultyDigits); i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    randomArray += charset[randomIndex];
  }
  return randomArray;
};
const diff_string_to_256array = (difficulty) => {
  const byteArray = [];
  for (let i = 0; i < difficulty.length; i += 2) {
    if (difficulty[i] == '0' && difficulty[i + 1] == '0') {
      byteArray.push(0);
    };
    if (difficulty[i] == '0' && difficulty[i + 1] == 'F') {
      byteArray.push(15);
    };
    if (difficulty[i] == 'F' && difficulty[i + 1] == 'F') {
      byteArray.push(255);
    };
    if (difficulty[i] == 'F' && difficulty[i + 1] == '0') {
      byteArray.push(240);
    };
  }
  return byteArray;
};

const generateBlockTemplate = () => {
  // const version = "22064000" // 4바이트
  // const previousBlockHash = generateRandomHash(inputdifficulty); // len = 128;
  const previousBlockHash = "00000000007EB85F4A2BBAD4B04F42DC05A17443F78D9514DFE0FD51E1CF49F5"; //32바이트
  const merkleRoot = generateRandomHash(0);
  const timestamp = Math.floor(Date.now() / 1000).toString(16); // len = 8
  return fromHexString((`${previousBlockHash}${merkleRoot}${timestamp}`).toUpperCase());
}

const mining = async (inputdifficulty) => {

  //GPU 가용여부 확인
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { return; }
  const device = await adapter.requestDevice();

  const returnObejct = [];

  const difficulty = diff_string_to_256array(setDifficulty(inputdifficulty));
  returnObejct.push(`Difficulty (len = ${difficulty.length}): ${difficulty}`);

  const baseHashArray = generateBlockTemplate();
  console.log("Base Array : ", baseHashArray, "\nSize : ", baseHashArray.byteLength);

  const gpuBufferbaseHashArray = device.createBuffer({
    mappedAtCreation: true,
    size: baseHashArray.byteLength,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrayBufferbaseHashArray = gpuBufferbaseHashArray.getMappedRange();
  new Int32Array(arrayBufferbaseHashArray).set(baseHashArray);
  gpuBufferbaseHashArray.unmap();

  const difficultySize = device.createBuffer({
    mappedAtCreation: true,
    size: 4,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrayBufferSize = difficultySize.getMappedRange();
  new Int32Array(arrayBufferSize).set([inputdifficulty]);
  difficultySize.unmap();

  const gpuBufferDifficulty = device.createBuffer({
    mappedAtCreation: true,
    size: 128,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrayBufferDifficulty = gpuBufferDifficulty.getMappedRange();
  new Int32Array(arrayBufferDifficulty).set(difficulty);
  gpuBufferDifficulty.unmap();

  const resultHashBufferSize = Uint32Array.BYTES_PER_ELEMENT * 20480;
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

  // // 이렇게 파이프라인 짤때도 bindgroupLayout으로 짜야함
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

  // // 파이프라인 만들고, 바인딩한거 세팅하고
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);

  // // 워크그룹 만들어 디스패칭. 여기  체크하고 넘어갈 것
  passEncoder.dispatchWorkgroups(20); // 64로 변경
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
    for (let value of Array.from(new Uint32Array(hashBuffer))) {
      hash += u32Arr_to_hexArr(value) + ",";
    }

    let nonce = "";
    for (let value of Array.from(new Uint32Array(nonceBuffer))) {
      nonce += (value - 48);
    }

    returnObejct.push(`Final nonce : ${nonce}`);
    returnObejct.push(`Hash result : ${hash.toUpperCase()}`);
  } else {
    returnObejct.push('No valid nonce found.');
  };

  returnObejct.push(`Operation time (sec) : ${(end - start) / 1000}`);
  console.log(new Uint32Array(hashBuffer))
  const returnHTML = `
  <ul>
    ${returnObejct.map((data, idx) => `<li key=${idx}>${data}</li><br/>`).join('')}
  </ul>`;

  return returnHTML;

}