$ErrorActionPreference='Stop'
$mutex=[Threading.Mutex]::new($false,'Global\StableCloudEncryptionSync')
$held=$false
try{
 try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
 if(!$held){exit 0}
 & C:\stable-cloud\runtime\node.exe C:\stable-cloud\egress-sync\encryption-sync.cjs run
 exit $LASTEXITCODE
}finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
