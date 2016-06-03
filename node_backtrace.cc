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

#include <errno.h>
#include <inttypes.h>
#include <stdio.h>
#include <sys/ptrace.h>
#include <sys/types.h>
#include <sys/user.h>
#include <sys/wait.h>

#include <nan.h>

using namespace v8;

#define MAX_STACK_DEPTH 200

static const size_t FP_RETURN_ADDRESS_OFFSET = 0x08;
static size_t frames[MAX_STACK_DEPTH * 2];
static int fcount;

static Persistent<Array> jsframes; 

size_t strip_low_bit(size_t addr) {
    return addr & ~(size_t)1;
}

size_t read_user_size_t(pid_t pid, size_t addr) {
    size_t result;
    errno = 0;
    result = ptrace(PTRACE_PEEKDATA, pid, addr, 0);
    if (errno != 0) {
        // printf("Error peeking at address 0x%016"PRIx64"\n", addr);
        return 0;
    }
    return result;
}

size_t read_user_pointer(pid_t pid, size_t addr) {
    return strip_low_bit(read_user_size_t(pid, strip_low_bit(addr)));
}

long attach_process(pid_t pid) {
    return ptrace(PTRACE_SEIZE, (pid_t)pid, NULL, 0);
}

long pause_process(pid_t pid) {
    int status;
    long ptrace_result = ptrace(PTRACE_INTERRUPT, pid, NULL, NULL);

    if (ptrace_result != 0) {
        return ptrace_result;
    }

    waitpid(pid, &status, WSTOPPED);

    return ptrace_result;
}

long resume_process(pid_t pid) {
    return ptrace(PTRACE_CONT, pid, NULL, NULL);
}

long detach_process(pid_t pid) {
    pause_process(pid);
    return ptrace(PTRACE_DETACH, pid, NULL, NULL);
}

long take_backtrace(pid_t pid) {
    size_t pc;
    size_t frame;
    struct user_regs_struct regs;

    long pause_result = pause_process(pid);

    if (pause_result != 0) {
        return pause_result;
    }

    long ptrace_result = ptrace(PTRACE_GETREGS, pid, NULL, &regs);

    if (ptrace_result != 0) {
        return ptrace_result;
    }

    pc = regs.rip;
    frame = regs.rbp;

    for (fcount = 0; fcount < MAX_STACK_DEPTH && frame != 0; fcount++) {
        frames[fcount * 2] = pc;
        frames[fcount * 2 + 1] = frame;
        pc = read_user_pointer(pid, frame + FP_RETURN_ADDRESS_OFFSET);
        frame = read_user_pointer(pid, frame);
    }

    return ptrace_result;
}

NAN_METHOD(PTraceAttach) {
    NanScope();

    pid_t pid = (pid_t)args[0].As<Integer>()->Int32Value();
    long result = attach_process(pid);

    if (result == 0) {
        NanReturnValue(NanTrue());
    } else {
        NanReturnValue(NanFalse());
    }
}

NAN_METHOD(PTraceBacktrace) {
    NanScope();

    pid_t pid = (pid_t)args[0].As<Integer>()->Int32Value();
    long result = take_backtrace(pid);

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

NAN_METHOD(PTraceResume) {
    NanScope();

    pid_t pid = (pid_t)args[0].As<Integer>()->Int32Value();
    long result = resume_process(pid);
    
    if (result == 0) {
        NanReturnValue(NanTrue());
    } else {
        NanReturnValue(NanFalse());
    }
}

NAN_METHOD(PTraceDetach) {
    NanScope();

    pid_t pid = (pid_t)args[0].As<Integer>()->Int32Value();
    long result = detach_process(pid);
    
    if (result == 0) {
        NanReturnValue(NanTrue());
    } else {
        NanReturnValue(NanFalse());
    }
}

void Init(Handle<Object> exports) {
    NanAssignPersistent(jsframes, NanNew<Array>(MAX_STACK_DEPTH * 2 + 1));

    exports->Set(
        NanNew("attach"),
        NanNew<FunctionTemplate>(PTraceAttach)->GetFunction()
    );
    exports->Set(
        NanNew("backtrace"),
        NanNew<FunctionTemplate>(PTraceBacktrace)->GetFunction()
    );
    exports->Set(
        NanNew("resume"),
        NanNew<FunctionTemplate>(PTraceResume)->GetFunction()
    );
    exports->Set(
        NanNew("detach"),
        NanNew<FunctionTemplate>(PTraceDetach)->GetFunction()
    );
}

NODE_MODULE(node_backtrace, Init);
