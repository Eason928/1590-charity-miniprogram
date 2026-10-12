#!/bin/bash
# 数据库实时查询监控
# 按 Ctrl+C 停止

echo "=== 数据库实时查询监控 ==="
echo "启动时间: $(date)"
echo ""

while true; do
  echo "--- $(date +%H:%M:%S) ---"
  mysql -e "SELECT event_time, LEFT(argument,180) AS q FROM mysql.general_log WHERE command_type='Query' AND argument NOT LIKE '%general_log%' AND argument NOT LIKE 'SELECT event_time%' AND argument NOT LIKE '%mysql.%' ORDER BY event_time DESC LIMIT 10;" 2>&1
  echo ""
  sleep 3
done
