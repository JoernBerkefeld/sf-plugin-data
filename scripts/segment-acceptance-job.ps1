$ErrorActionPreference = 'Stop'
# The helper owns the only job handle; only the explicit standard-handle list is inherited.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;

public static class SegmentAcceptanceJob {
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFO {
        public int cb; public IntPtr reserved, desktop, title;
        public int x,y,xSize,ySize,xCount,yCount,fill,flags;
        public short show, reserved2; public IntPtr reservedPointer, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO startup; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int length; public IntPtr descriptor; public int inherit; }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {
        public IntPtr process, thread; public uint processId, threadId;
    }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT {
        public long processTime, jobTime; public uint flags;
        public UIntPtr minWorking, maxWorking; public uint activeLimit;
        public UIntPtr affinity; public uint priority, scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS {
        public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT {
        public BASIC_LIMIT basic; public IO_COUNTERS io;
        public UIntPtr processMemory, jobMemory, peakProcess, peakJob;
    }
    [StructLayout(LayoutKind.Sequential)] struct ACCOUNTING {
        public long userTime,kernelTime,periodUser,periodKernel;
        public uint faults,totalProcesses,activeProcesses,terminatedProcesses;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref EXTENDED_LIMIT limits, uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out ACCOUNTING accounting, uint size, IntPtr returned);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateProcessW(string executable, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string directory, ref STARTUPINFOEX startup, out PROCESS_INFORMATION process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SECURITY_ATTRIBUTES attributes, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileW(string name, uint access, uint share, ref SECURITY_ATTRIBUTES attributes, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadFile(IntPtr handle, byte[] buffer, uint count, out uint read, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AllocConsole();
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    static int cancelled, overflow, captureFailure, captured;
    static readonly object outputLock=new object();
    static void Emit(string value) { lock(outputLock) { Console.WriteLine(value); Console.Out.Flush(); } }
    static Thread Reader(IntPtr handle, string stream, int limit) {
        Thread reader=new Thread(delegate() {
            try {
                byte[] bytes=new byte[3072]; uint count;
                while(true) {
                    bool ok=ReadFile(handle,bytes,(uint)bytes.Length,out count,IntPtr.Zero);
                    if(!ok) { if(Marshal.GetLastWin32Error()!=109) Interlocked.Exchange(ref captureFailure,1); break; }
                    if(count==0) break;
                    lock(outputLock) {
                        int keep=Math.Min((int)count,Math.Max(0,limit-captured));
                        captured+=keep;
                        if(keep>0) Emit("{\"event\":\"output\",\"stream\":\""+stream+"\",\"base64\":\""+Convert.ToBase64String(bytes,0,keep)+"\"}");
                        if(keep<count) Interlocked.Exchange(ref overflow,1);
                    }
                }
            } catch { Interlocked.Exchange(ref captureFailure,1); }
        });
        reader.IsBackground=true; reader.Start(); return reader;
    }
    static uint Remaining(long deadline) { return (uint)Math.Max(0,Math.Min(1000,deadline-Now())); }
    static long Now() { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }
    static void Check(bool ok, string operation) {
        if (!ok) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), operation);
    }
    static ACCOUNTING Accounting(IntPtr job) {
        ACCOUNTING result;
        Check(QueryInformationJobObject(job,1,out result,(uint)Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero),"Query job accounting");
        return result;
    }
    static string Quote(string value) {
        StringBuilder result = new StringBuilder("\""); int slashes=0;
        foreach(char c in value) {
            if(c=='\\') { slashes++; continue; }
            if(c=='\"') { result.Append('\\',slashes*2+1); result.Append(c); }
            else { result.Append('\\',slashes); result.Append(c); }
            slashes=0;
        }
        result.Append('\\',slashes*2); return result.Append('"').ToString();
    }
    public static void Run(string executable, string[] args, string directory, string environment, long deadline, long workDeadline, int maxOutputBytes) {
        IntPtr job=IntPtr.Zero, environmentPointer=IntPtr.Zero;
        IntPtr stdoutRead=IntPtr.Zero, stdoutWrite=IntPtr.Zero, stderrRead=IntPtr.Zero, stderrWrite=IntPtr.Zero, input=IntPtr.Zero, attributes=IntPtr.Zero, handles=IntPtr.Zero;
        bool attributesReady=false, drained=false; Thread stdoutReader=null, stderrReader=null;
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        bool assigned=false, resumed=false, zero=false, rootExited=false;
        uint exitCode=0, totalProcesses=0; string reason="failure", failure="";
        // EOF or any subsequent input is cancellation, including caller death.
        Thread watcher=new Thread(delegate() { Console.ReadLine(); Interlocked.Exchange(ref cancelled,1); });
        watcher.IsBackground=true; watcher.Start();
        try {
            // Replace the inherited console association with a helper-owned console.
            // Its host is created before the workload Job; descendants inherit this
            // console instead of creating an unadmitted conhost per console launch.
            Check(FreeConsole(),"Detach helper console");
            Check(AllocConsole(),"Allocate helper console"); ShowWindow(GetConsoleWindow(),0);
            job=CreateJobObjectW(IntPtr.Zero,null); Check(job!=IntPtr.Zero,"Create job");
            EXTENDED_LIMIT limits=new EXTENDED_LIMIT(); limits.basic.flags=0x2000;
            Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT))),"Set kill on close");
            if(Now()>=workDeadline || Volatile.Read(ref cancelled)!=0) throw new Exception("Cancelled before launch");
            StringBuilder command=new StringBuilder(Quote(executable));
            foreach(string arg in args) command.Append(" ").Append(Quote(arg));
            if(command.Length>=32767) throw new Exception("Command line too long");
            environmentPointer=Marshal.StringToHGlobalUni(environment);
            SECURITY_ATTRIBUTES security=new SECURITY_ATTRIBUTES(); security.length=Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); security.inherit=1;
            Check(CreatePipe(out stdoutRead,out stdoutWrite,ref security,0),"Create stdout pipe");
            Check(SetHandleInformation(stdoutRead,1,0),"Noninherit stdout reader");
            Check(CreatePipe(out stderrRead,out stderrWrite,ref security,0),"Create stderr pipe");
            Check(SetHandleInformation(stderrRead,1,0),"Noninherit stderr reader");
            input=CreateFileW("NUL",0x80000000,3,ref security,3,0,IntPtr.Zero);
            Check(input!=new IntPtr(-1),"Open null stdin");
            IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
            attributes=Marshal.AllocHGlobal(size);
            Check(InitializeProcThreadAttributeList(attributes,1,0,ref size),"Initialize exact handle list"); attributesReady=true;
            handles=Marshal.AllocHGlobal(IntPtr.Size*3);
            Marshal.WriteIntPtr(handles,0,input); Marshal.WriteIntPtr(handles,IntPtr.Size,stdoutWrite); Marshal.WriteIntPtr(handles,IntPtr.Size*2,stderrWrite);
            Check(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero),"Set exact inherited handles");
            STARTUPINFOEX startup=new STARTUPINFOEX(); startup.startup.cb=Marshal.SizeOf(typeof(STARTUPINFOEX));
            startup.startup.flags=0x101; startup.startup.show=0; startup.startup.input=input; startup.startup.output=stdoutWrite; startup.startup.error=stderrWrite; startup.attributes=attributes;
            // Exact handle list excludes Job, control, reader and unrelated handles.
            // CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT.
            // Inherit the helper's existing console; NO_WINDOW/DETACHED would leave
            // Node descendants without a console and cause incidental conhost jobs.
            if(Now()>=workDeadline || Volatile.Read(ref cancelled)!=0) throw new Exception("Cancelled before process creation");
            Check(CreateProcessW(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x00080404,environmentPointer,directory,ref startup,out process),"Create suspended process");
            CloseHandle(stdoutWrite); stdoutWrite=IntPtr.Zero; CloseHandle(stderrWrite); stderrWrite=IntPtr.Zero; CloseHandle(input); input=IntPtr.Zero;
            stdoutReader=Reader(stdoutRead,"stdout",maxOutputBytes); stderrReader=Reader(stderrRead,"stderr",maxOutputBytes);
            Check(AssignProcessToJobObject(job,process.process),"Assign suspended process"); assigned=true;
            if(Now()>=workDeadline || Volatile.Read(ref cancelled)!=0) throw new Exception("Cancelled before resume");
            Check(ResumeThread(process.thread)!=0xffffffff,"Resume owned process"); resumed=true;
            Emit("{\"event\":\"resumed\"}");
            while(true) {
                if(Volatile.Read(ref overflow)!=0) { reason="output-overflow"; break; }
                if(Volatile.Read(ref captureFailure)!=0) { reason="capture-failure"; break; }
                uint wait=WaitForSingleObject(process.process,10);
                if(wait==0) { rootExited=true; Check(GetExitCodeProcess(process.process,out exitCode),"Read root exit"); reason="exit"; break; }
                Check(wait==258,"Wait root");
                if(Volatile.Read(ref cancelled)!=0) { reason="cancelled"; break; }
                if(Now()>=workDeadline) { reason="timeout"; break; }
            }
        } catch(Exception error) { failure=error.Message; }
        finally {
            try {
                if(job!=IntPtr.Zero && assigned) {
                    if(Accounting(job).activeProcesses!=0) {
                        Check(TerminateJobObject(job,0xe0000001),"Terminate owned job");
                    }
                    // Zero is kernel job accounting, not a PID-enumeration inference.
                    while(Accounting(job).activeProcesses!=0 && Now()<deadline) Thread.Sleep(5);
                    ACCOUNTING finalAccounting=Accounting(job);
                    zero=finalAccounting.activeProcesses==0;
                    totalProcesses=finalAccounting.totalProcesses;
                    if(process.process!=IntPtr.Zero && WaitForSingleObject(process.process,Remaining(deadline))==0) {
                        rootExited=true; Check(GetExitCodeProcess(process.process,out exitCode),"Read final root exit");
                    }
                } else if(process.process!=IntPtr.Zero) {
                    // Assignment failed: terminate only the still-suspended handle we created.
                    Check(TerminateProcess(process.process,0xe0000001),"Terminate suspended process");
                    rootExited=WaitForSingleObject(process.process,Remaining(deadline))==0;
                    zero=rootExited;
                } else { zero=true; }
            } catch(Exception error) { failure += "; cleanup: " + error.Message; zero=false; }
            // Release all local writer copies before joining concurrent drainers.
            if(stdoutWrite!=IntPtr.Zero) CloseHandle(stdoutWrite);
            if(stderrWrite!=IntPtr.Zero) CloseHandle(stderrWrite);
            if(input!=IntPtr.Zero && input!=new IntPtr(-1)) CloseHandle(input);
            if(stdoutReader!=null && stderrReader!=null) {
                bool outDone=stdoutReader.Join((int)Remaining(deadline));
                bool errDone=stderrReader.Join((int)Remaining(deadline));
                drained=outDone && errDone && Volatile.Read(ref captureFailure)==0;
            }
            if(Volatile.Read(ref overflow)!=0) reason="output-overflow";
            if(attributesReady) DeleteProcThreadAttributeList(attributes);
            if(attributes!=IntPtr.Zero) Marshal.FreeHGlobal(attributes);
            if(handles!=IntPtr.Zero) Marshal.FreeHGlobal(handles);
            // Do not close a handle while its synchronous reader is still using it.
            // On incomplete drain the helper exits; the caller never accepts its receipt.
            if(stdoutRead!=IntPtr.Zero && (stdoutReader==null || !stdoutReader.IsAlive)) CloseHandle(stdoutRead);
            if(stderrRead!=IntPtr.Zero && (stderrReader==null || !stderrReader.IsAlive)) CloseHandle(stderrRead);
            if(environmentPointer!=IntPtr.Zero) Marshal.FreeHGlobal(environmentPointer);
            if(process.thread!=IntPtr.Zero) CloseHandle(process.thread);
            if(process.process!=IntPtr.Zero) CloseHandle(process.process);
            // KILL_ON_JOB_CLOSE also applies on abnormal helper death. Without a receipt the caller must report UNKNOWN.
            if(job!=IntPtr.Zero) CloseHandle(job);
        }
        string encoded=Convert.ToBase64String(Encoding.UTF8.GetBytes(failure));
        Emit("{\"event\":\"receipt\",\"outputDrained\":"+(drained?"true":"false")+",\"outputTruncated\":"+(overflow!=0?"true":"false")+",\"capturedBytes\":"+captured+",\"assignedBeforeResume\":"+(assigned&&resumed?"true":"false")+",\"resumed\":"+(resumed?"true":"false")+",\"rootExited\":"+(rootExited?"true":"false")+",\"exitCode\":"+exitCode+",\"activeProcessesZero\":"+(zero?"true":"false")+",\"totalProcesses\":"+totalProcesses+",\"reason\":\""+reason+"\",\"failureBase64\":\""+encoded+"\"}");
        Console.Out.Flush();
    }
}
'@
# No command is dispatched until compilation completes and the caller rechecks its clock.
[Console]::Out.WriteLine('{"event":"ready"}')
[Console]::Out.Flush()
$line = [Console]::ReadLine()
if (-not $line) { exit 1 }
$config = $line | ConvertFrom-Json
$environment = (($config.environment | ForEach-Object { [string]$_ }) -join "`0") + "`0`0"
[SegmentAcceptanceJob]::Run([string]$config.executable, [string[]]$config.args, [string]$config.cwd, $environment, [long]$config.deadline, [long]$config.workDeadline, [int]$config.maxOutputBytes)
