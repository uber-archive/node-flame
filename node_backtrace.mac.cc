// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

#include <stdio.h>
#include <sys/types.h>
#include <mach/mach_types.h>
#include <mach/mach_vm.h>
#include <mach/mach.h>

#include <nan.h>

using namespace v8;

#define MAX_STACK_DEPTH 200

#define IS_RUNNING(proc) ((proc->kp_proc.p_stat & SRUN) != 0)


static const size_t FP_RETURN_ADDRESS_OFFSET = 0x08;
static size_t frames[MAX_STACK_DEPTH * 2];
static int fcount;

static Persistent<Array> jsframes;

static Persistent<Array> threadregs; 

size_t strip_low_bit(size_t addr) {
    return addr & ~(size_t)1;
}

size_t read_user_size_t(task_t port, size_t addr) {
    kern_return_t result;
    vm_offset_t data;
    uint32_t readCount;

    result = result = vm_read(port, addr, sizeof(size_t), &data, &readCount);

    if (result != KERN_SUCCESS || readCount != sizeof(size_t)) {
        return 0;
    }

    return (size_t) *((size_t*)(data));
}

uint8_t readUInt8(task_t port, size_t addr) {
    kern_return_t result;
    vm_offset_t data;
    uint32_t readCount;

    result = vm_read(port, addr, sizeof(uint8_t), &data, &readCount);

    if (result != KERN_SUCCESS || readCount != sizeof(uint8_t)) {
        return 0;
    }

    return (uint8_t) *((uint8_t*)(data));
}

uint16_t readUInt16(task_t port, size_t addr) {
    kern_return_t result;
    vm_offset_t data;
    uint32_t readCount;

    result = vm_read(port, addr, sizeof(uint16_t), (vm_offset_t*)&data, &readCount);

    if (result != KERN_SUCCESS || readCount != sizeof(uint16_t)) {
        return 0;
    }

    return (uint16_t) *((uint16_t*)(data));
}

uint32_t readUInt32(task_t port, size_t addr) {
    kern_return_t result;
    vm_offset_t data;
    uint32_t readCount;

    result = vm_read(port, addr, sizeof(uint32_t), &data, &readCount);

    if (result != KERN_SUCCESS || readCount != sizeof(uint32_t)) {
        return 0;
    }

    return (uint32_t) *((uint32_t*)(data));
}

uint64_t readUInt64(task_t port, size_t addr) {
    kern_return_t result;
    vm_offset_t data;
    uint32_t readCount;

    result = vm_read(port, addr, sizeof(uint64_t), &data, &readCount);

    if (result != KERN_SUCCESS || readCount != sizeof(uint64_t)) {
        return 0;
    }

    return (uint64_t) *((uint64_t*)(data));
}

size_t read_user_pointer(task_t port, size_t addr) {
    return strip_low_bit(read_user_size_t(port, strip_low_bit(addr)));
}

kern_return_t attach_process(pid_t pid, task_t* port) {
    return task_for_pid(mach_task_self(), pid, port);
}

kern_return_t task_is_running(task_t port, bool* isRunning) {
    struct task_basic_info info;
    mach_msg_type_number_t size = TASK_BASIC_INFO_COUNT;
    kern_return_t result = -1;


    result = task_info(port, TASK_BASIC_INFO, (task_info_t)&info, &size);

    if (result != KERN_SUCCESS) {
        return result;
    }

    (*isRunning) = info.suspend_count == 0;
    return KERN_SUCCESS;
}

kern_return_t pause_process(task_t port) {
    kern_return_t result = -1;
    bool isRunning;

    if (task_is_running(port, &isRunning) == KERN_SUCCESS && !isRunning) {
        result = KERN_SUCCESS;
    } else {
        result = task_suspend(port);
    }

    return result;
}

kern_return_t resume_process(task_t port) {
    kern_return_t result = -1;
    bool isRunning;

    if (task_is_running(port, &isRunning) == KERN_SUCCESS && isRunning) {
        result = KERN_SUCCESS;
    } else {
        result = task_resume(port);
    }

    return result;
}

static int btcount = 0;

kern_return_t take_backtrace(task_t port) {
    size_t pc;
    size_t frame;
    kern_return_t result;
    x86_thread_state64_t state;
    mach_msg_type_number_t sc = x86_THREAD_STATE64_COUNT;
    thread_act_port_array_t thread_list;
    mach_msg_type_number_t thread_count;

    result = pause_process(port);

    if (result) {
        return result;
    }

    result = task_threads(port, &thread_list, &thread_count);

    if (result != KERN_SUCCESS) {
        return result;
    }

    result = thread_get_state(
        thread_list[0],
        x86_THREAD_STATE64,
        (thread_state_t)&state,
        &sc
    );

    if (result != KERN_SUCCESS) {
        return result;
    }

    pc = state.__rip;
    frame = state.__rbp;
    
    
   for (fcount = 0; fcount < MAX_STACK_DEPTH && frame != 0; fcount++) {
        frames[fcount * 2] = pc;
        frames[fcount * 2 + 1] = frame;
        pc = read_user_pointer(port, frame + FP_RETURN_ADDRESS_OFFSET);
        frame = read_user_pointer(port, frame);
    }

    return KERN_SUCCESS;
}

NAN_METHOD(TaskPort) {
    NanScope();

    task_t port;
    pid_t pid = (pid_t)args[0].As<Integer>()->Int32Value();
    kern_return_t result = attach_process(pid, &port);

    if (result == KERN_SUCCESS) {
        NanReturnValue(NanNew<Number>(port));
    } else {
        NanReturnValue(NanNew<Number>(-1));
    }
}

NAN_METHOD(Backtrace) {
    NanScope();

    task_t port = (task_t)args[0].As<Integer>()->Int32Value();
    kern_return_t result = take_backtrace(port);

    if (result == 0) {
        jsframes->Set(0, NanNew<Int32>(fcount));
        for (int i = 0; i < fcount; i++) {
            jsframes->Set(2 * i + 1, NanNew<Number>(frames[2 * i]));
            jsframes->Set(2 * i + 2, NanNew<Number>(frames[2 * i + 1]));
        }
    } else {
        jsframes->Set(0, NanNew<Int32>(-1));
    }

    NanReturnValue(jsframes);
}

NAN_METHOD(Resume) {
    NanScope();

    task_t port = (task_t)args[0].As<Integer>()->Int32Value();
    kern_return_t result = resume_process(port);
    
    if (result == 0) {
        NanReturnValue(NanTrue());
    } else {
        NanReturnValue(NanFalse());
    }
}

NAN_METHOD(ReadUInt8) {
    NanScope();

    task_t port = (task_t)args[0].As<Integer>()->Int32Value();
    size_t addr = (size_t)args[1].As<Number>()->Value();

    uint8_t result = readUInt8(port, addr);

    NanReturnValue(NanNew<Number>(result));
}

NAN_METHOD(ReadUInt16) {
    NanScope();

    task_t port = (task_t)args[0].As<Integer>()->Int32Value();
    size_t addr = (size_t)args[1].As<Number>()->Value();

    uint16_t result = readUInt16(port, addr);

    NanReturnValue(NanNew<Number>(result));
}

NAN_METHOD(ReadUInt32) {
    NanScope();

    task_t port = (task_t)args[0].As<Integer>()->Int32Value();
    size_t addr = (size_t)args[1].As<Number>()->Value();

    uint32_t result = readUInt32(port, addr);

    NanReturnValue(NanNew<Number>(result));
}

NAN_METHOD(ReadUInt64) {
    NanScope();

    task_t port = (task_t)args[0].As<Integer>()->Int32Value();
    size_t addr = (size_t)args[1].As<Number>()->Value();



    uint64_t result = readUInt64(port, addr);

    NanReturnValue(NanNew<Number>(result));
}

void Init(Handle<Object> exports) {
    NanAssignPersistent(jsframes, NanNew<Array>(MAX_STACK_DEPTH * 2 + 1));

    exports->Set(
        NanNew("taskPort"),
        NanNew<FunctionTemplate>(TaskPort)->GetFunction()
    );
    exports->Set(
        NanNew("backtrace"),
        NanNew<FunctionTemplate>(Backtrace)->GetFunction()
    );
    exports->Set(
        NanNew("resume"),
        NanNew<FunctionTemplate>(Resume)->GetFunction()
    );
    exports->Set(
        NanNew("readUInt8"),
        NanNew<FunctionTemplate>(ReadUInt8)->GetFunction()
    );
    exports->Set(
        NanNew("readUInt16"),
        NanNew<FunctionTemplate>(ReadUInt16)->GetFunction()
    );
    exports->Set(
        NanNew("readUInt32"),
        NanNew<FunctionTemplate>(ReadUInt32)->GetFunction()
    );
    exports->Set(
        NanNew("readUInt64"),
        NanNew<FunctionTemplate>(ReadUInt64)->GetFunction()
    );
}

NODE_MODULE(node_backtrace, Init);
