"""Parse only: a small data-processing subset, never eval/exec user code here."""
import ast
import json
import sys

MODULES = {
    'json': {'load', 'loads', 'dump', 'dumps'},
    'collections': {'defaultdict', 'Counter'},
    'math': {'ceil', 'floor', 'sqrt', 'isfinite', 'isnan', 'fabs', 'log', 'log10'},
    'statistics': {'mean', 'median', 'stdev', 'pstdev'},
}
BUILTINS = {'print', 'len', 'sorted', 'sum', 'min', 'max', 'abs', 'round', 'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'enumerate', 'zip', 'range', 'reversed', 'all', 'any'}
METHODS = {'get', 'items', 'keys', 'values', 'append', 'extend', 'add', 'update', 'setdefault', 'sort', 'count', 'index', 'join', 'strip', 'lstrip', 'rstrip', 'lower', 'upper', 'replace', 'split', 'splitlines', 'startswith', 'endswith', 'read', 'write', 'close'}
NODES = {'Module', 'Import', 'ImportFrom', 'alias', 'Assign', 'AugAssign', 'AnnAssign', 'Expr', 'For', 'If', 'Break', 'Continue', 'Pass', 'With', 'withitem', 'Name', 'Load', 'Store', 'Constant', 'List', 'Tuple', 'Set', 'Dict', 'Subscript', 'Slice', 'BinOp', 'UnaryOp', 'BoolOp', 'Compare', 'IfExp', 'Call', 'Attribute', 'keyword', 'ListComp', 'SetComp', 'DictComp', 'GeneratorExp', 'comprehension', 'Lambda', 'arguments', 'arg', 'JoinedStr', 'FormattedValue', 'Add', 'Sub', 'Mult', 'Div', 'FloorDiv', 'Mod', 'Pow', 'USub', 'UAdd', 'Not', 'And', 'Or', 'Eq', 'NotEq', 'Lt', 'LtE', 'Gt', 'GtE', 'Is', 'IsNot', 'In', 'NotIn'}

def assess(source):
    tree = ast.parse(source)
    nodes = list(ast.walk(tree))
    if len(nodes) > 20000:
        raise ValueError('脚本过大')
    parents = {child: node for node in nodes for child in ast.iter_child_nodes(node)}
    modules, functions, variables, paths = {}, {}, set(), []
    for node in nodes:
        if type(node).__name__ not in NODES:
            raise ValueError('脚本包含未核实的语法')
        if isinstance(node, ast.Import):
            for item in node.names:
                if item.name not in MODULES:
                    raise ValueError('脚本导入了数据处理范围外的模块')
                modules[item.asname or item.name] = item.name
        if isinstance(node, ast.ImportFrom):
            if node.level or node.module not in MODULES:
                raise ValueError('脚本导入了数据处理范围外的模块')
            for item in node.names:
                if item.name not in MODULES[node.module]:
                    raise ValueError('未核实的导入成员')
                functions[item.asname or item.name] = (node.module, item.name)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            variables.add(node.id)
        if isinstance(node, ast.arg):
            variables.add(node.arg)
    reserved = set(modules) | set(functions) | BUILTINS | {'open'}
    if variables & reserved or len(reserved) != len(modules) + len(functions) + len(BUILTINS) + 1:
        raise ValueError('脚本覆盖了内置函数或模块')
    for node in nodes:
        if isinstance(node, ast.Name):
            if node.id.startswith('_') and node.id != '_':
                raise ValueError('脚本访问内部对象')
            if isinstance(node.ctx, ast.Load) and node.id not in reserved | variables:
                raise ValueError('脚本引用了未核实的对象')
            # I/O callables cannot be passed to map/sort/defaultdict or aliased.
            if node.id == 'open' and not (isinstance(parents.get(node), ast.Call) and parents[node].func is node):
                raise ValueError('文件操作不能间接调用')
        if isinstance(node, ast.Attribute):
            if not isinstance(node.ctx, ast.Load) or node.attr.startswith('_'):
                raise ValueError('脚本修改属性或访问内部对象')
            if isinstance(node.value, ast.Name) and node.value.id in modules:
                if node.attr not in MODULES[modules[node.value.id]]:
                    raise ValueError('未核实的模块成员')
            elif node.attr not in METHODS:
                raise ValueError('未核实的数据方法')
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name):
                if func.id not in BUILTINS | set(functions) | {'open'}:
                    raise ValueError('脚本包含动态调用')
                if func.id == 'open':
                    if not 1 <= len(node.args) <= 2 or not isinstance(node.args[0], ast.Constant) or not isinstance(node.args[0].value, str):
                        raise ValueError('文件路径必须是固定文本')
                    kwargs = {kw.arg: kw.value for kw in node.keywords}
                    if any(key not in {'mode', 'encoding', 'newline', 'errors'} for key in kwargs) or any(not isinstance(value, ast.Constant) for value in kwargs.values()):
                        raise ValueError('文件操作参数需要复核')
                    mode = node.args[1] if len(node.args) == 2 else kwargs.get('mode', ast.Constant(value='r'))
                    if not isinstance(mode, ast.Constant) or mode.value not in {'r', 'rt', 'rb', 'w', 'wt', 'wb', 'a', 'at', 'ab', 'x', 'xt', 'xb'}:
                        raise ValueError('文件模式需要复核')
                    paths.append({'path': node.args[0].value, 'mode': 'read' if mode.value.startswith('r') else 'write'})
            elif not isinstance(func, ast.Attribute):
                raise ValueError('脚本包含动态调用')
            if any(kw.arg is None for kw in node.keywords) or any(isinstance(arg, ast.Starred) for arg in node.args):
                raise ValueError('展开参数需要复核')
    return {'risk': 'safe', 'paths': paths}

try:
    request = json.load(sys.stdin)
    result = assess(request['source'])
except Exception as error:
    result = {'risk': 'unknown', 'reason': str(error)[:120] if isinstance(error, ValueError) else 'Python 语法检查未完成'}
print(json.dumps(result, ensure_ascii=False))
