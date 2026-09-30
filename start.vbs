' TESTONIC R&D - 3D Print Viewer
Dim fso, scriptDir
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "pythonw """ & scriptDir & "\launcher.py""", 0, False
