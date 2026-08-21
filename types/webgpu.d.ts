/**
 * Ambient WebGPU Type & Value Definitions for zero-build IDE / JSDoc IntelliSense
 */

interface GPU {
    requestAdapter(options?: any): Promise<GPUAdapter | null>;
    getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPUAdapter {
    requestDevice(descriptor?: any): Promise<GPUDevice>;
    readonly limits: any;
    readonly features: any;
}

interface GPUDevice {
    createBuffer(descriptor: { size: number; usage: number; mappedAtCreation?: boolean }): GPUBuffer;
    createShaderModule(descriptor: { code: string }): GPUShaderModule;
    createBindGroupLayout(descriptor: { entries: any[] }): GPUBindGroupLayout;
    createPipelineLayout(descriptor: { bindGroupLayouts: GPUBindGroupLayout[] }): GPUPipelineLayout;
    createComputePipeline(descriptor: { layout: GPUPipelineLayout; compute: { module: GPUShaderModule; entryPoint: string } }): GPUComputePipeline;
    createRenderPipeline(descriptor: {
        layout: GPUPipelineLayout;
        vertex: { module: GPUShaderModule; entryPoint: string };
        fragment: { module: GPUShaderModule; entryPoint: string; targets: Array<{ format: GPUTextureFormat }> };
        primitive?: { topology?: string };
    }): GPURenderPipeline;
    createBindGroup(descriptor: { layout: GPUBindGroupLayout; entries: Array<{ binding: number; resource: { buffer: GPUBuffer } }> }): GPUBindGroup;
    createCommandEncoder(descriptor?: any): GPUCommandEncoder;
    readonly queue: GPUQueue;
}

interface GPUBuffer {
    getMappedRange(offset?: number, size?: number): ArrayBuffer;
    unmap(): void;
    destroy(): void;
    readonly size: number;
    readonly usage: number;
}

interface GPUQueue {
    writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource, dataOffset?: number, size?: number): void;
    submit(commandBuffers: GPUCommandBuffer[]): void;
}

interface GPUCanvasContext {
    configure(config: { device: GPUDevice; format: GPUTextureFormat; alphaMode?: 'premultiplied' | 'opaque' }): void;
    getCurrentTexture(): GPUTexture;
}

interface GPUTexture {
    createView(descriptor?: any): GPUTextureView;
    readonly width: number;
    readonly height: number;
    readonly format: GPUTextureFormat;
}

interface GPUTextureView {}
interface GPUShaderModule {}
interface GPUBindGroupLayout {}
interface GPUPipelineLayout {}
interface GPUComputePipeline {}
interface GPURenderPipeline {}
interface GPUBindGroup {}
interface GPUCommandBuffer {}

interface GPUCommandEncoder {
    beginComputePass(descriptor?: any): GPUComputePassEncoder;
    beginRenderPass(descriptor: {
        colorAttachments: Array<{
            view: GPUTextureView;
            clearValue?: { r: number; g: number; b: number; a: number };
            loadOp: 'clear' | 'load';
            storeOp: 'store' | 'discard';
        }>;
    }): GPURenderPassEncoder;
    copyBufferToBuffer(source: GPUBuffer, sourceOffset: number, destination: GPUBuffer, destinationOffset: number, size: number): void;
    finish(): GPUCommandBuffer;
}

interface GPUComputePassEncoder {
    setPipeline(pipeline: GPUComputePipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
    end(): void;
}

interface GPURenderPassEncoder {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
    end(): void;
}

type GPUTextureFormat = 'bgra8unorm' | 'rgba8unorm' | 'rgba16float' | string;

declare var GPUBufferUsage: {
    readonly MAP_READ: number;
    readonly MAP_WRITE: number;
    readonly COPY_SRC: number;
    readonly COPY_DST: number;
    readonly INDEX: number;
    readonly VERTEX: number;
    readonly UNIFORM: number;
    readonly STORAGE: number;
    readonly INDIRECT: number;
    readonly QUERY_RESOLVE: number;
};

declare var GPUShaderStage: {
    readonly VERTEX: number;
    readonly FRAGMENT: number;
    readonly COMPUTE: number;
};

interface Navigator {
    readonly gpu?: GPU;
}
