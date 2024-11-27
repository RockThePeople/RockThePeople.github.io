const GPUBufferUsage = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200
};

const GPUShaderStage = {
  VERTEX: 0x1,
  FRAGMENT: 0x2,
  COMPUTE: 0x4
};

const GPUMapMode = {
  READ: 0x0001,
  WRITE: 0x0002
};

const u32Arr_to_hexArr = (value) => {
  let hexString = value.toString(16);
  if (hexString.length < 2) {
    hexString = '0' + hexString;
  }
  return hexString;
}

const fromHexString = (hexString) => Uint32Array.from((hexString.split("").map(e => e.charCodeAt(0))));

const mining = async (inputtarget, global_start, dispatchSize, workSize, blockheader, address) => {

  const dispatchSizeN = Number(dispatchSize);
  const workSizeN = Number(workSize);

  const returnObejct = [];
  const baseHashArray = fromHexString(blockheader + address); // 800 Byte
  const target = inputtarget;

  //GPU 가용여부 확인
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { return; }
  const device = await adapter.requestDevice();

  const gpuBufferbaseHashArray = device.createBuffer({
    mappedAtCreation: true,
    size: baseHashArray.byteLength,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrayBufferbaseHashArray = gpuBufferbaseHashArray.getMappedRange();
  new Int32Array(arrayBufferbaseHashArray).set(baseHashArray);
  gpuBufferbaseHashArray.unmap();

  const targetSize = device.createBuffer({
    mappedAtCreation: true,
    size: 4,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrayBufferSize = targetSize.getMappedRange();
  new Int32Array(arrayBufferSize).set([32]);
  targetSize.unmap();

  const gpuBuffertarget = device.createBuffer({
    mappedAtCreation: true,
    size: 128,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrayBuffertarget = gpuBuffertarget.getMappedRange();
  new Int32Array(arrayBuffertarget).set(target);
  gpuBuffertarget.unmap();

  const resultHashBufferSize = Uint32Array.BYTES_PER_ELEMENT * 32;
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
      { binding: 1, resource: { buffer: targetSize } },
      { binding: 2, resource: { buffer: gpuBuffertarget } },
      { binding: 3, resource: { buffer: resultHashBuffer } },
      { binding: 4, resource: { buffer: resultNonceBuffer } },
      { binding: 5, resource: { buffer: flagBuffer } }
    ]
  });

  const shaderModule = device.createShaderModule({
    code:
      `struct SHA256_CTX {
        data : array<u32, 64>,
        datalen : u32,
        bitlen : array<u32, 2>,
        state : array<u32, 8>,
        info : u32,
      };

      @group(0) @binding(0) var<storage, read> input : array<u32>;
      @group(0) @binding(1) var<storage, read> targetSize : array<u32>;
      @group(0) @binding(2) var<storage, read> target : array<u32>;
      @group(0) @binding(3) var<storage, read_write> finalHash : array<u32>;
      @group(0) @binding(4) var<storage, read_write> finalNonce : array<u32>;
      @group(0) @binding(5) var<storage, read_write> flagBuffer : atomic<u32>;

      const SHA256_BLOCK_SIZE = 32;
      const inputLen = 200;
      const headerLen = 210;

      const k = array<u32, 64> (
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
      );

      fn ROTLEFT(a : u32, b : u32) -> u32{return (((a) << (b)) | ((a) >> (32-(b))));}
      fn ROTRIGHT(a : u32, b : u32) -> u32{return (((a) >> (b)) | ((a) << (32-(b))));}

      fn CH(x : u32, y : u32, z : u32) -> u32{return (((x) & (y)) ^ (~(x) & (z)));}
      fn MAJ(x : u32, y : u32, z : u32) -> u32{return (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)));}
      fn EP0(x : u32) -> u32{return (ROTRIGHT(x,2) ^ ROTRIGHT(x,13) ^ ROTRIGHT(x,22));}
      fn EP1(x : u32) -> u32{return (ROTRIGHT(x,6) ^ ROTRIGHT(x,11) ^ ROTRIGHT(x,25));}
      fn SIG0(x : u32) -> u32{return (ROTRIGHT(x,7) ^ ROTRIGHT(x,18) ^ ((x) >> 3));}
      fn SIG1(x : u32) -> u32{return (ROTRIGHT(x,17) ^ ROTRIGHT(x,19) ^ ((x) >> 10));}

      fn sha256_transform(ctx : ptr<function, SHA256_CTX>)
      {
        var a : u32;
        var b : u32;
        var c : u32;
        var d : u32;
        var e : u32;
        var f : u32;
        var g : u32;
        var h : u32;
        var i : u32 = 0;
        var j : u32 = 0;
        var t1 : u32;
        var t2 : u32;
        var m : array<u32, 64>;

        while(i < 16) {
          m[i] = ((*ctx).data[j] << 24) | ((*ctx).data[j + 1] << 16) | ((*ctx).data[j + 2] << 8) | ((*ctx).data[j + 3]);
          i++;
          j += 4;
        }            

        while(i < 64) {
              m[i] = SIG1(m[i - 2]) + m[i - 7] + SIG0(m[i - 15]) + m[i - 16];
          i++;
        }

        a = (*ctx).state[0];
        b = (*ctx).state[1];
        c = (*ctx).state[2];
        d = (*ctx).state[3];
        e = (*ctx).state[4];
        f = (*ctx).state[5];
        g = (*ctx).state[6];
        h = (*ctx).state[7];

        i = 0;
        for (; i < 64; i++) {
          t1 = h + EP1(e) + CH(e,f,g) + k[i] + m[i];
          t2 = EP0(a) + MAJ(a,b,c);
          h = g;
          g = f;
          f = e;
          e = d + t1;
          d = c;
          c = b;
          b = a;
          a = t1 + t2;
        }

        (*ctx).state[0] += a;
        (*ctx).state[1] += b;
        (*ctx).state[2] += c;
        (*ctx).state[3] += d;
        (*ctx).state[4] += e;
        (*ctx).state[5] += f;
        (*ctx).state[6] += g;
        (*ctx).state[7] += h;
      }

      fn sha256_update(ctx : ptr<function, SHA256_CTX>, data : ptr<function, array<u32, headerLen>>, len : u32)
      {
        for (var i : u32 = 0; i < len; i++) {
          (*ctx).data[(*ctx).datalen] = (*data)[i];
          (*ctx).datalen++;
          if ((*ctx).datalen == 64) {
            sha256_transform(ctx);
            if ((*ctx).bitlen[0] > 0xffffffff - 512) {
              (*ctx).bitlen[1]++;
            };
            (*ctx).bitlen[0] += 512;
            (*ctx).datalen = 0;
          }
        }
      }

      fn sha256_update_2(ctx : ptr<function, SHA256_CTX>, data : ptr<function, array<u32, SHA256_BLOCK_SIZE>>)
      {
        for (var i : u32 = 0; i < SHA256_BLOCK_SIZE; i++) {
          (*ctx).data[(*ctx).datalen] = (*data)[i];
          (*ctx).datalen++;
          if ((*ctx).datalen == 64) {
            sha256_transform(ctx);
            if ((*ctx).bitlen[0] > 0xffffffff - 512) {
              (*ctx).bitlen[1]++;
            };
            (*ctx).bitlen[0] += 512;
            (*ctx).datalen = 0;
          }
        }
      }

      fn sha256_final(ctx : ptr<function, SHA256_CTX>, hash:  ptr<function, array<u32, SHA256_BLOCK_SIZE>>  )
      {
        var i : u32 = (*ctx).datalen;

        if ((*ctx).datalen < 56) {
          (*ctx).data[i] = 0x80;
            i++;
          while (i < 56){
            (*ctx).data[i] = 0x00;
            i++;
          }
        } else {
          (*ctx).data[i] = 0x80;
          i++;
          while (i < 64){
            (*ctx).data[i] = 0x00;
            i++;
          }
          sha256_transform(ctx);
          for (var i: u32 = 0; i < 56 ; i++) {
            (*ctx).data[i] = 0;
          }
        }
      
        if ((*ctx).bitlen[0] > 0xffffffff - (*ctx).datalen * 8) {
          (*ctx).bitlen[1]++;
        }
        (*ctx).bitlen[0] += (*ctx).datalen * 8;
        (*ctx).data[63] = (*ctx).bitlen[0];
        (*ctx).data[62] = (*ctx).bitlen[0] >> 8;
        (*ctx).data[61] = (*ctx).bitlen[0] >> 16;
        (*ctx).data[60] = (*ctx).bitlen[0] >> 24;
        (*ctx).data[59] = (*ctx).bitlen[1];
        (*ctx).data[58] = (*ctx).bitlen[1] >> 8;
        (*ctx).data[57] = (*ctx).bitlen[1] >> 16;
        (*ctx).data[56] = (*ctx).bitlen[1] >> 24;
        sha256_transform(ctx);
      
        for (i = 0; i < 4; i++) {
          (*hash)[i] = ((*ctx).state[0] >> (24 - i * 8)) & 0x000000ff;
          (*hash)[i + 4] = ((*ctx).state[1] >> (24 - i * 8)) & 0x000000ff;
          (*hash)[i + 8] = ((*ctx).state[2] >> (24 - i * 8)) & 0x000000ff;
          (*hash)[i + 12] = ((*ctx).state[3] >> (24 - i * 8)) & 0x000000ff;
          (*hash)[i + 16] = ((*ctx).state[4] >> (24 - i * 8)) & 0x000000ff;
          (*hash)[i + 20] = ((*ctx).state[5] >> (24 - i * 8)) & 0x000000ff;
          (*hash)[i + 24] = ((*ctx).state[6] >> (24 - i * 8)) & 0x000000ff;
          (*hash)[i + 28] = ((*ctx).state[7] >> (24 - i * 8)) & 0x000000ff;
        }
      }

      fn u32_array_less_than(hash : ptr<function, array<u32, SHA256_BLOCK_SIZE>>, diff : ptr<function, array<u32, SHA256_BLOCK_SIZE>>, len : u32) -> bool {
        for (var i : u32 = 0; i < len; i++) {
          if ((*hash)[i] > (*diff)[i]) {
            return false;
          } else if ((*hash)[i] < (*diff)[i]) {
            return true;
          }
        }
        return true;
      }

      fn u32_nonce_to_u32_array(n: u32) -> array<u32, 10> {
        var result : array<u32, 10>;
        var temp : u32 = n; 

        for(var i :u32 = 10u ; i > 0; i--) {
          if(temp == 0) {
            result[i-1] = 48;
          }
          result[i-1] = (temp % 10u) + 48u;
          temp = temp / 10u;
        };
        return result;
      }

      @compute @workgroup_size(${workSizeN})
      fn main(
        @builtin(workgroup_id) workgroup_id : vec3<u32>,
        @builtin(local_invocation_index) local_invocation_index: u32
        // @builtin(local_invocation_id) local_invocation_id : vec3<u32>,
        // @builtin(global_invocation_id) global_invocation_id : vec3<u32>,
        // @builtin(num_workgroups) num_workgroups: vec3<u32>
      ) {

        var ctx : SHA256_CTX;
        var hash : array<u32, SHA256_BLOCK_SIZE>;
        var local_target : array<u32, SHA256_BLOCK_SIZE>;
        var local_targetSize : u32 = targetSize[0];
        var local_input : array<u32, headerLen>;
        var nonce_array : array<u32, 10>;
        let nonce : u32 = local_invocation_index * ${dispatchSize} + local_invocation_index;

        for (var i : u32 = 0; i < inputLen; i++) { local_input[i] = input[i]; }
        for (var i : u32 = 0; i < SHA256_BLOCK_SIZE; i++) { local_target[i] = target[i]; }
          
        if (atomicLoad(&flagBuffer) == 1u) { return; }
        nonce_array = u32_nonce_to_u32_array(nonce);
        for (var k : u32 = 0; k < 10; k++) { 
          let k_i : u32 = k + inputLen;
          local_input[k_i] = nonce_array[k]; 
        }
         ctx.datalen = 0;
        ctx.bitlen[0] = 0;
        ctx.bitlen[1] = 0;
        ctx.state[0] = 0x6a09e667;
        ctx.state[1] = 0xbb67ae85;
        ctx.state[2] = 0x3c6ef372;
        ctx.state[3] = 0xa54ff53a;
        ctx.state[4] = 0x510e527f;
        ctx.state[5] = 0x9b05688c;
        ctx.state[6] = 0x1f83d9ab;
        ctx.state[7] = 0x5be0cd19;
        sha256_update(&ctx, &local_input, headerLen);
        sha256_final(&ctx, &hash);

        ctx.datalen = 0;
        ctx.bitlen[0] = 0;
        ctx.bitlen[1] = 0;
        ctx.state[0] = 0x6a09e667;
        ctx.state[1] = 0xbb67ae85;
        ctx.state[2] = 0x3c6ef372;
        ctx.state[3] = 0xa54ff53a;
        ctx.state[4] = 0x510e527f;
        ctx.state[5] = 0x9b05688c;
        ctx.state[6] = 0x1f83d9ab;
        ctx.state[7] = 0x5be0cd19;
        sha256_update_2(&ctx, &hash);
        sha256_final(&ctx, &hash);

        if (u32_array_less_than(&hash, &local_target, local_targetSize)) {
          for (var i : u32 = 0; i < SHA256_BLOCK_SIZE; i++) { finalHash[i] = hash[i]; };
          for (var j : u32 = 0; j < 10; j++) { finalNonce[j] = nonce_array[j]; };
          atomicStore(&flagBuffer, 1u);
          return;
        }
      }`
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
  passEncoder.dispatchWorkgroups(dispatchSizeN);
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
  returnObejct.push((end - start) / 1000);
  if (flag === 1) {
    let hash = "";
    for (let value of Array.from(new Uint32Array(hashBuffer))) { hash += u32Arr_to_hexArr(value); }
    let nonce = "";
    for (let value of Array.from(new Uint32Array(nonceBuffer))) { nonce += (value - 48); }
    returnObejct.push(hash.toUpperCase());
    returnObejct.push(nonce);
  }
  return returnObejct;
};

export default async function miningResult(target, dispatch, worksize, blockheader, iterIndex, startingPoint, address) {
  const global_start = startingPoint  * iterIndex;
  return await mining(target, global_start, dispatch, worksize, blockheader, address);
}