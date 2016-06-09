{
  "targets": [
    {
      "target_name": "demangle",
      "sources": [ "demangle.cc" ]
    },
    {
      "target_name": "node_backtrace",
      "include_dirs": ["<!(node -e \"require('nan')\")"],
      "conditions": [
        ['OS == "linux"', {
          "sources": [ "node_backtrace.linux.cc" ]
        }],
        ['OS == "mac"', {
          "sources": [ "node_backtrace.mac.cc" ]
        }]
      ]
    }
  ]
}
