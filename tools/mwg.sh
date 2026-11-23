#!/bin/sh
# Modern Web Guidance —— 给编码 Agent 用的 Web 现代写法指南（Google Chrome）
# 用法：./tools/mwg.sh search "dialog animation"
#       ./tools/mwg.sh retrieve js
#       ./tools/mwg.sh legacy-scan .
# 说明：本机全局 ~/.npm 里有 root 拥有的缓存文件，这里把 npm cache 指到临时目录。
exec env \
  npm_config_cache="${TMPDIR:-/tmp}/mwg-npm-cache" \
  npm_config_logs_dir="${TMPDIR:-/tmp}/mwg-npm-logs" \
  npx -y modern-web-guidance@latest "$@"
