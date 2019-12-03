## Synopsis

(This project is deprecated and not maintained.)

Tools for profiling Node.js programs. Uses ptrace to collect and symbolicate
JavaScript backtraces, extracting human-readable names by walking the V8 stack
and heap.

**node-flame** is an iteration on [node-stap](https://github.com/uber/node-stap),
using ptrace instead of system-tap to collect backtraces.

Uses wrapper scripts and
[node-stackvis](https://github.com/joyent/node-stackvis)
to generate textual or HTML flamegraphs. Can also output text suitable for input
to [FlameGraph](https://github.com/brendangregg/FlameGraph).

Inspired and informed by Dave Pacheco's excellent
[V8 DTrace ustack helper](https://www.joyent.com/blog/understanding-dtrace-ustack-helpers).

## Safety

**Your process is paused briefly when ptrace is attached to the process.**

Understand that tools that use ptrace, such as **strace** or **node-flame** can
have a negative impact on your processes. For example, if you abruptly kill
node-flame or strace, the process you are profiling can get stuck in a stopped
state.

Ptrace interrupts syscalls. Node/libuv handles this correctly, but it can
interfere more intricately with the performance of your process.

The nature of pausing the process and resuming it means that it will slow down
and this slowdown can be significant.

**Recommended to try in safe environments before running in production!**

## Caveats

* Only works on 64-bit node processes.
* Line numbers are best effort (not always available) and refer to the start of
a function.
* Only tested on node0.10 so far. [TODO: fix for node4+]
* Stacks may omit inlined functions.
* Also may elide frames on very deep stacks to avoid doing too much work
* Requires sudo due to ptrace kernel protection

## Basic Usage

```
[~/] sudo npm i node-flame -g
[~/node-flame]$ sudo node-flame 
Usage: sudo node-flame <pid> <text|flame|raw|fullraw> <duration (s)>
  text: textual flame graph.
  flame: html flame graph.
  raw: format suitable for input to FlameGraph tools.
```

## HTML Example

```
[~/]$ sudo node-flame 24701 flame 10 > /tmp/flame.html
Sampling 24701 for 10s, outputting flame.

[~/]$ # done
```

## Raw Example

```
[~/]$ sudo node-flame 2291 raw 10 > /tmp/flame.raw
Sampling 2291 for 10s, outputting raw.

[~/]$ cd ./FlameGraph/
[~/FlameGraph]$ ./stackcollapse.pl /tmp/flame.raw | tr -d "\0" > /tmp/flame.folded
[~/FlameGraph]$ ./flamegraph.pl /tmp/flame.folded > /tmp/flame.svg

```

## Text Example

```
[~/]$ cat ./test.js
var dummy = new Error().stack; // Persuade v8 to compute line numbers

while(true) {
    console.log("Hello!");
}
[~/]$ node ./test.js  > /dev/null & 
[1] 2291
[~/]$ sudo node-flame 2291 text 10
Sampling 2291 for 10s, outputting text.

Total samples: 747
747 node::Start(int, char**):[native]
  747 node::Load(v8::Handle<v8::Object>):[native]
    747 v8::Function::Call(v8::Handle<v8::Object>, int, v8::Handle<v8::Value>*):[native]
      747 v8::internal::Execution::Call(v8::internal::Handle<v8::internal::Object>, v8::internal::Handle<v8::internal::Object>, int, v8::internal::Handle<v8::internal::Object>*, bool*, bool):[native]
        747 [0x72a82a in /usr/bin/nodejs]:[native]
          747 [entry frame]
            747 [internal frame]
              747 [empty]:[unknown]:26
                747 startup:[unknown]:29
                  747 Module.runMain:module.js:494
                    747 Module._load:module.js:274
                        ... [more]
```

## Installation

```
sudo npm i node-flame -g
```

## Tests

All things in the fullness of time.

## Contributors

* dh
* jcorbin
* Matt-Esch
* Raynos

## Future Work

* Reflect on the symbol table to target different versions of v8
* Mac support
* Post-process to resolve line numbers (compute line endings from files)

## License

MIT
