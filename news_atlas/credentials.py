"""Opt-in local credential storage, separate from news DBs and HTTP static assets."""
import os
import tempfile
from pathlib import Path


def key_path(db_path):
    path=Path(db_path)
    return path.parent/'private'/(path.name+'.massive-key')


def validate_key(value):
    if not isinstance(value,str) or not value.strip() or len(value.strip())>512 or any(ord(c)<32 or ord(c)>126 for c in value.strip()):
        raise ValueError('API key 格式不正確')
    return value.strip()


def load_key(db_path):
    try:
        return validate_key(key_path(db_path).read_text())
    except (OSError,ValueError):
        return ''


def save_key(db_path,value):
    value=validate_key(value)
    path=key_path(db_path);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True);path.parent.chmod(0o700)
    fd,temp=tempfile.mkstemp(prefix='.massive-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as file:
            file.write(value);file.flush();os.fsync(file.fileno())
        os.replace(temp,path)
    finally:
        if os.path.exists(temp):os.unlink(temp)


def forget_key(db_path):
    key_path(db_path).unlink(missing_ok=True)
