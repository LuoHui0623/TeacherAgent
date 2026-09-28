from pathlib import Path

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent.parent
BACKEND_ROOT: Path = Path(__file__).resolve().parent.parent
DATA_DIR: Path = PROJECT_ROOT / 'data'
TUTORIAL_DIR: Path = DATA_DIR / 'textbooks'
CHAT_LOG_DIR: Path = DATA_DIR / 'chat_logs'
LOG_DIR: Path = BACKEND_ROOT / 'logs'
CONFIG_DIR: Path = BACKEND_ROOT / 'config'
DEFAULT_CONFIG_PATH: Path = CONFIG_DIR / 'config.yaml'
ENV_PATH: Path = CONFIG_DIR / '.env'
PROMPT_DIR: Path = BACKEND_ROOT / 'agent' / 'prompts'

print(PROJECT_ROOT)
print(BACKEND_ROOT)