#!/usr/bin/env bash

set -e

source env/bin/activate
source production-settings.sh

export FLASK_ENV=production

GUNICORN_SOCKET=/tmp/dexter-gunicorn.sock
GUNICORN_WORKERS=3

exec gunicorn \
    -w $GUNICORN_WORKERS \
    -b unix:$GUNICORN_SOCKET \
    --timeout 120 \
    app:app
    2>&1