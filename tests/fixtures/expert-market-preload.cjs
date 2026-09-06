const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('stable',{market:Object.fromEntries(['list','detail','toggle','remove','use'].map(method=>[method,(...args)=>ipcRenderer.invoke('expert-test:'+method,...args)]))})
