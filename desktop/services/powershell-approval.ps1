# Parse only. The requested script is stdin data and is NEVER invoked.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$tokens = $null; $parseErrors = $null
$tree = [System.Management.Automation.Language.Parser]::ParseInput($request.script, [ref]$tokens, [ref]$parseErrors)
$script:risk = 'safe'; $script:reason = '已识别为读取、筛选或工作区文件操作'
$script:paths = [Collections.Generic.List[object]]::new()
$script:values = @{}
function Review($risk, $reason) {
    if ($script:risk -ne 'high' -and ($risk -eq 'high' -or $script:risk -eq 'safe')) {
        $script:risk = $risk; $script:reason = $reason
    }
}
function Literal($node) {
    if ($node -is [System.Management.Automation.Language.StringConstantExpressionAst] -or $node -is [System.Management.Automation.Language.ConstantExpressionAst]) { return [string]$node.Value }
    if ($node -is [System.Management.Automation.Language.VariableExpressionAst] -and $script:values.ContainsKey($node.VariablePath.UserPath)) { return $script:values[$node.VariablePath.UserPath] }
    if ($node -is [System.Management.Automation.Language.ExpandableStringExpressionAst] -and $node.NestedExpressions.Count -eq 1 -and $node.Extent.Text -match '^"\$\{?\w+\}?"$') { return Literal $node.NestedExpressions[0] }
    Review 'unknown' '参数包含无法静态确认的表达式'
    return $null
}
$allowedNodes = @('ScriptBlockAst','NamedBlockAst','PipelineAst','CommandAst','CommandParameterAst','CommandExpressionAst','StringConstantExpressionAst','ConstantExpressionAst','ExpandableStringExpressionAst','VariableExpressionAst','AssignmentStatementAst','StatementBlockAst','ScriptBlockExpressionAst','BinaryExpressionAst','MemberExpressionAst','ArrayLiteralAst','ParenExpressionAst')
$commands = @{
    'get-content' = 'path,literalpath,totalcount,tail,raw,encoding,erroraction'
    'get-childitem' = 'path,literalpath,filter,include,exclude,force,directory,file,recurse,depth,name,erroraction'
    'get-item' = 'path,literalpath,force,erroraction'
    'test-path' = 'path,literalpath,pathtype,erroraction'
    'resolve-path' = 'path,literalpath,relative,erroraction'
    'select-string' = 'path,literalpath,pattern,context,simplematch,casesensitive,list,allmatches,quiet,encoding,erroraction'
    'select-object' = 'property,first,last,skip,unique,expandproperty'
    'where-object' = 'filterscript'
    'sort-object' = 'property,descending,unique'
    'measure-object' = 'property,sum,average,minimum,maximum,line,word,character'
    'format-list' = 'property'
    'format-table' = 'property,autosize,wrap'
    'write-output' = 'inputobject,noenumerate'
    'write-host' = 'object,nonewline,foregroundcolor,backgroundcolor,separator'
    'set-content' = 'path,literalpath,value,encoding,nonewline,erroraction'
    'add-content' = 'path,literalpath,value,encoding,nonewline,erroraction'
    'out-file' = 'filepath,literalpath,encoding,append,nonewline,erroraction'
    'new-item' = 'path,name,itemtype,value,erroraction'
}
if ($parseErrors.Count) { Review 'unknown' '命令语法无法完整解析' }
foreach ($node in $tree.FindAll({ param($n) $true }, $true)) {
    $type = $node.GetType().Name
    if ($type -notin $allowedNodes) { Review 'unknown' "命令含需复核的语法：$type" }
    if ($type -eq 'VariableExpressionAst' -and ($node.VariablePath.UserPath -match ':' -or $node.VariablePath.UserPath -in @('ExecutionContext','PSDefaultParameterValues','OFS'))) { Review 'unknown' '命令访问环境或执行配置变量' }
    if ($type -eq 'MemberExpressionAst' -and ($node.Static -or $node.Expression.Extent.Text -notin @('$_','$PSItem') -or $node.Member.Value -notin @('Name','FullName','Length','LastWriteTime','Extension','PSIsContainer'))) { Review 'unknown' '命令包含需复核的成员访问' }
    if ($type -eq 'BinaryExpressionAst' -and [string]$node.Operator -notin @('Ieq','Ine','Igt','Ige','Ilt','Ile','Ilike','Inotlike','Imatch','Inotmatch','And','Or')) { Review 'unknown' '命令包含需复核的运算' }
    if ($type -eq 'ScriptBlockExpressionAst') {
        if ($node.Parent -isnot [System.Management.Automation.Language.CommandAst] -or $node.Parent.GetCommandName() -ne 'Where-Object') { Review 'unknown' '命令包含可执行脚本块' }
    }
    if ($type -eq 'AssignmentStatementAst') {
        # Only top-level, single literal assignments; no computed values or scopes.
        $name = if ($node.Left -is [System.Management.Automation.Language.VariableExpressionAst]) { $node.Left.VariablePath.UserPath } else { '' }
        $right = $node.Right
        if ($name -notmatch '^\w+$' -or $name -in @('_','PSItem') -or $node.Parent -isnot [System.Management.Automation.Language.NamedBlockAst] -or $script:values.ContainsKey($name) -or [string]$node.Operator -ne 'Equals' -or $right -isnot [System.Management.Automation.Language.CommandExpressionAst] -or $right.Expression -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) {
            Review 'unknown' '变量赋值需要进一步复核'
        } else { $script:values[$name] = [string]$right.Expression.Value }
    }
    if ($type -ne 'CommandAst') { continue }
    $name = $node.GetCommandName()
    if (!$name) { Review 'unknown' '动态命令需要人工确认'; continue }
    $name = $name.ToLowerInvariant()
    if ($name -in @('remove-item','rm','del','erase','rd','rmdir','clear-content','clear-item','format-volume','format','set-itemproperty','remove-itemproperty','reg','reg.exe','stop-process','stop-computer','restart-computer')) { Review 'high' '命令包含删除、清空或系统修改'; continue }
    if ($name -in @('git','git.exe') -and $node.Extent.Text -match '(?i)\b(reset|clean|push)\b') { Review 'high' '命令包含历史改写、清理或远程推送'; continue }
    if (!$commands.ContainsKey($name) -or [string]$node.InvocationOperator -ne 'Unknown') { Review 'unknown' '命令包含尚未核实的程序或调用方式'; continue }
    $parameters = @{}; $positionals = [Collections.Generic.List[object]]::new()
    $switches = @('raw','force','directory','file','recurse','name','relative','simplematch','casesensitive','list','allmatches','quiet','unique','descending','sum','average','minimum','maximum','line','word','character','autosize','wrap','noenumerate','nonewline','append')
    $elements = $node.CommandElements
    for ($i = 1; $i -lt $elements.Count; $i++) {
        $element = $elements[$i]
        if ($element -is [System.Management.Automation.Language.CommandParameterAst]) {
            $parameter = $element.ParameterName.ToLowerInvariant()
            if ($parameter -notin $commands[$name].Split(',') -or $parameters.ContainsKey($parameter)) { Review 'unknown' '命令含未核实、缩写或重复参数' }
            $argument = $element.Argument
            if (!$argument -and $parameter -notin $switches -and $i+1 -lt $elements.Count -and $elements[$i+1] -isnot [System.Management.Automation.Language.CommandParameterAst]) { $argument = $elements[++$i] }
            $parameters[$parameter] = $argument
        } else { $positionals.Add($element) }
    }
    $fileCommand = $name -in @('get-content','get-childitem','get-item','test-path','resolve-path','select-string','set-content','add-content','out-file','new-item')
    if ($fileCommand) {
        $mode = if ($name -in @('set-content','add-content','out-file','new-item')) { 'write' } elseif ($name -in @('get-content','select-string')) { 'read' } else { 'list' }
        $target = $null
        foreach ($key in @('path','literalpath','filepath')) { if ($parameters.ContainsKey($key)) { if ($target) { Review 'unknown' '多个路径参数需要复核' }; $target = $parameters[$key] } }
        if (!$target -and $positionals.Count -gt 0 -and $name -ne 'select-string') { $target = $positionals[0] }
        if (!$target) { Review 'unknown' '未能确定操作路径' } else {
            $value = Literal $target
            if ($null -ne $value) { $script:paths.Add(@{ path = $value; mode = $mode }) }
        }
        if ($name -eq 'new-item') {
            if (!$parameters.ContainsKey('itemtype') -or (Literal $parameters['itemtype']) -notin @('File','Directory')) { Review 'unknown' '仅普通文件或目录创建可自动批准' }
            if ($parameters.ContainsKey('name')) { Review 'unknown' '分段目标路径需要复核' }
        }
    }
    # Literal values only outside Where-Object: reject interpolation, variable
    # splatting and expression arguments even for otherwise harmless cmdlets.
    foreach ($element in $elements | Select-Object -Skip 1) {
        if ($element -is [System.Management.Automation.Language.CommandParameterAst] -or $element -is [System.Management.Automation.Language.ScriptBlockExpressionAst]) { continue }
        if ($element -is [System.Management.Automation.Language.ArrayLiteralAst]) { foreach ($entry in $element.Elements) { $null = Literal $entry } }
        else { $null = Literal $element }
    }
}
@{ risk = $script:risk; reason = $script:reason; paths = @($script:paths.ToArray()) } | ConvertTo-Json -Depth 8 -Compress
