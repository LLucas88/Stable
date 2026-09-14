const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{EventEmitter}=require('node:events')
const source=fs.readFileSync(require('node:path').join(__dirname,'../desktop/main.cjs'),'utf8')
const block=source.slice(source.indexOf("const { TaskAlerts }"),source.indexOf('app.setAppUserModelId(APP_ID)'))
test('desktop adapter delivers in-app fallback and notification click restores the matching task',()=>{
 const delivered=[],actions=[],notices=[]
 class Notification extends EventEmitter{static isSupported(){return true}constructor(options){super();this.options=options;notices.push(this)}show(){actions.push('show-toast')}close(){actions.push('close-toast')}}
 const mainWindow={isDestroyed:()=>false,isFocused:()=>false,isMinimized:()=>true,restore:()=>actions.push('restore'),show:()=>actions.push('show'),focus:()=>actions.push('focus'),flashFrame:v=>actions.push(['flash',v]),webContents:{send:(...args)=>delivered.push(args)}}
 const store={conversation:id=>id==='a'?{title:'测试任务'}:null,selectConversation:id=>actions.push(['select',id])}
 const alerts=vm.runInNewContext(block+';taskAlerts',{require:name=>require('../desktop/services/task-alerts.cjs'),Notification,mainWindow,store,pendingApproval:()=>null,agentState:id=>({activeConversationId:id}),setInterval:()=>({unref(){}})})
 alerts.start('a');alerts.wait('a','approval');assert.equal(notices.length,1);assert.equal(delivered[0][0],'stable:task:notice')
 notices[0].emit('click');assert.deepEqual(actions.slice(-4),['restore','show','focus',['flash',false]])
 assert(actions.some(x=>Array.isArray(x)&&x[0]==='select'&&x[1]==='a'))
 assert.equal(delivered.at(-1)[0],'stable:task:open');assert.equal(delivered.at(-1)[1].activeConversationId,'a')
 alerts.finish('a');assert(actions.includes('close-toast'));assert.equal(delivered.at(-1)[1].clear,true)
 Notification.isSupported=()=>false
 alerts.start('a');alerts.wait('a','input','input');assert.equal(notices.length,1);assert.equal(delivered.at(-1)[1].title,'任务等待补充信息')
})
