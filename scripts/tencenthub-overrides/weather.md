# 天气查询与预报

确认城市或坐标、日期、单位，优先用可用天气工具；否则通过 HTTPS 读取公开天气服务。Windows 终端使用 `curl.exe`，避免 PowerShell 的 curl 别名产生参数差异。

```powershell
curl.exe --fail --silent --show-error --max-time 20 "https://wttr.in/London?format=3"
curl.exe --fail --silent --show-error --max-time 20 "https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&current_weather=true"
```

城市名称应正确 URL 编码；同名城市需要确认地区。不要沿用示例坐标作为用户所在地。服务返回后检查地点、时间、单位、时区和数据类型，再给出天气与来源链接。接口超时、限流或无数据时，尝试可用替代源或说明未获取，不用记忆编造实时预报。
