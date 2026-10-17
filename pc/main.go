// Windows launcher: opens the local studio, or MCSTUDIO_URL when configured.
// The Node.js server must already be running; this launcher only opens a window.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func main() {
	adresse := os.Getenv("MCSTUDIO_URL")
	if adresse == "" {
		adresse = "http://127.0.0.1:5930/"
	}
	profil := filepath.Join(os.Getenv("LOCALAPPDATA"), "MinecraftCreatorStudio", "fenetre")
	os.MkdirAll(profil, 0755)
	for _, p := range []string{
		filepath.Join(os.Getenv("ProgramFiles"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("LOCALAPPDATA"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("ProgramFiles"), `Microsoft\Edge\Application\msedge.exe`),
	} {
		if _, err := os.Stat(p); err == nil {
			c := exec.Command(p, "--app="+adresse, "--window-size=1300,860", "--user-data-dir="+profil, "--no-first-run", "--no-default-browser-check")
			c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			if c.Start() == nil {
				return
			}
		}
	}
	exec.Command("rundll32", "url.dll,FileProtocolHandler", adresse).Start()
}
