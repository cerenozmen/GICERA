#!/bin/sh
# Pushes a prep.py output dir's images to the phone's bench/in (app-private), for OcrBenchScreen's
# "Bench" button; with --pull, fetches the ML Kit results from bench/out into <dir>/mlkit/.
# Local only: adb over USB.
set -e
export MSYS_NO_PATHCONV=1
DIR="$1"
APP=com.gicera
if [ "$2" = "--pull" ]; then
  mkdir -p "$DIR/mlkit"
  for f in $(adb shell run-as $APP ls files/bench/out | tr -d '\r'); do
    adb exec-out run-as $APP cat "files/bench/out/$f" > "$DIR/mlkit/$f"
  done
  ls "$DIR/mlkit" | wc -l
  exit 0
fi
adb shell "run-as $APP sh -c 'rm -rf files/bench/in files/bench/out; mkdir -p files/bench/in files/bench/out'"
adb shell "rm -rf /data/local/tmp/benchin; mkdir -p /data/local/tmp/benchin"
for f in "$DIR"/*.jpg; do
  case "$(basename "$f")" in small_*) continue;; esac
  adb push "$f" /data/local/tmp/benchin/ > /dev/null
done
adb shell "run-as $APP sh -c 'cp /data/local/tmp/benchin/*.jpg files/bench/in/'"
adb shell "rm -rf /data/local/tmp/benchin"
adb shell run-as $APP ls files/bench/in | wc -l
