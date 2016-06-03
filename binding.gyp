{
  "targets": [
    {
      "target_name": "node_backtrace",
      "sources": [ "node_backtrace.cc" ],
      "include_dirs": ["<!(node -e \"require('nan')\")"]
    },
    {
      "target_name": "demangle",
      "sources": [ "demangle.cc" ]
    }
  ]
}
