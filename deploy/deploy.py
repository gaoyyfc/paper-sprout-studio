import base64
import hashlib
import os
import sys

import paramiko


def required(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"缺少环境变量：{name}")
    return value


host = required("PAPER_SPROUT_DEPLOY_HOST")
username = os.environ.get("PAPER_SPROUT_DEPLOY_USER", "root")
password = required("PAPER_SPROUT_DEPLOY_PASSWORD")
action = sys.argv[1] if len(sys.argv) > 1 else "check"

client = paramiko.SSHClient()
client.load_system_host_keys()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=host, username=username, password=password, timeout=20, auth_timeout=20)
key = client.get_transport().get_remote_server_key()
fingerprint = base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
print(f"SSH {key.get_name()} SHA256:{fingerprint}")

try:
    if action == "upload":
        local_path = required("PAPER_SPROUT_UPLOAD_LOCAL")
        remote_path = required("PAPER_SPROUT_UPLOAD_REMOTE")
        size = os.path.getsize(local_path)
        progress_state = {"last_percent": -1}

        def progress(transferred: int, _total: int) -> None:
            percent = int(transferred * 100 / max(size, 1))
            if percent >= progress_state["last_percent"] + 10 or percent == 100:
                progress_state["last_percent"] = percent
                print(f"上传进度 {percent}%")

        with client.open_sftp() as sftp:
            sftp.put(local_path, remote_path, callback=progress)
            sftp.chmod(remote_path, int(os.environ.get("PAPER_SPROUT_UPLOAD_MODE", "600"), 8))
    else:
        command = os.environ.get("PAPER_SPROUT_REMOTE_COMMAND") or (
            "set -eu; uname -a; cat /etc/os-release; "
            "printf 'node='; command -v node || true; node --version 2>/dev/null || true; "
            "printf 'pnpm='; command -v pnpm || true; pnpm --version 2>/dev/null || true; "
            "printf 'uv='; command -v uv || true; uv --version 2>/dev/null || true; "
            "printf 'nginx='; command -v nginx || true; nginx -v 2>&1 || true; "
            "printf 'chrome='; command -v google-chrome-stable || command -v chromium || true; "
            "df -h /home; free -h; nproc; ss -ltnp | grep -E ':(3000|9000)\\b' || true"
        )
        stdin, stdout, stderr = client.exec_command(command, get_pty=False, timeout=1800)
        exit_code = stdout.channel.recv_exit_status()
        output = stdout.read().decode("utf-8", errors="replace")
        error = stderr.read().decode("utf-8", errors="replace")
        if output:
            print(output, end="")
        if error:
            print(error, file=sys.stderr, end="")
        if exit_code:
            raise SystemExit(exit_code)
finally:
    client.close()
