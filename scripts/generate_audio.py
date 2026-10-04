import asyncio
import json
import os
import sys
import edge_tts

# Устранение проблемы с падением сокетов aiohttp на Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "public")

DEFAULT_VOICES = {
    "de": "de-DE-ConradNeural",
    "en": "en-GB-RyanNeural",
    "pl": "pl-PL-MarekNeural",
}


async def generate_speech(text: str, voice: str, out_path: str, max_retries: int = 3):
    normalized = os.path.normpath(out_path)
    os.makedirs(os.path.dirname(normalized), exist_ok=True)

    if os.path.exists(normalized) and os.path.getsize(normalized) > 0:
        print(f"  [ПРОПУСК] Уже существует: {os.path.relpath(normalized, PROJECT_ROOT)}")
        return True

    for attempt in range(1, max_retries + 1):
        try:
            communicate = edge_tts.Communicate(text, voice)
            # Таймаут на генерацию каждого файла во избежание бесконечного зависания
            await asyncio.wait_for(communicate.save(normalized), timeout=15.0)
            print(f"  [ГОТОВО] '{text}' -> {os.path.relpath(normalized, PROJECT_ROOT)}")
            return True
        except Exception as err:
            print(f"  [ПОПЫТКА {attempt}/{max_retries}] Ошибка для '{text}': {err}")
            if os.path.exists(normalized):
                try:
                    os.remove(normalized)
                except OSError:
                    pass
            if attempt < max_retries:
                await asyncio.sleep(1.5)
            else:
                print(
                    f"  [ПРЕДУПРЕЖДЕНИЕ] Не удалось сгенерировать аудио для '{text}'. В приложении сработает браузерный Web Speech API."
                )
                return False


async def process_unit(unit_path: str):
    full_path = os.path.abspath(unit_path)
    if not os.path.exists(full_path):
        print(f"[ОШИБКА] Файл урока не найден: {unit_path}")
        return

    with open(full_path, "r", encoding="utf-8") as f:
        unit = json.load(f)

    lang = unit.get("lang", "en")
    voice = unit.get("voice", DEFAULT_VOICES.get(lang, "en-GB-RyanNeural"))
    title = unit.get("title", unit.get("id", "Unknown"))

    print(f"\n=== Генерация озвучки: {title} ===")
    print(f"Язык: {lang} | Голос: {voice}")

    # 1. Текст урока
    for item in unit.get("text", []):
        text = item.get("target", "").strip()
        audio_rel = item.get("audio", "").strip()
        if text and audio_rel:
            target_file = os.path.join(PUBLIC_DIR, audio_rel)
            await generate_speech(text, voice, target_file)

    # 2. Слова (для спеллера)
    for item in unit.get("words", []):
        word = item.get("target", "").replace(" ", "").strip()
        audio_rel = item.get("audio", "").strip()
        if word and audio_rel:
            target_file = os.path.join(PUBLIC_DIR, audio_rel)
            await generate_speech(word, voice, target_file)

    # 3. Предложения (для пазла)
    for item in unit.get("sentences", []):
        sentence = item.get("target", "").strip()
        audio_rel = item.get("audio", "").strip()
        if sentence and audio_rel:
            target_file = os.path.join(PUBLIC_DIR, audio_rel)
            await generate_speech(sentence, voice, target_file)

    print(f"=== Урок '{title}' успешно озвучен ===\n")


async def main():
    target_unit = None
    if len(sys.argv) > 1:
        target_unit = sys.argv[1]

    if target_unit == "--test":
        print("=== Проверка подключения к Edge-TTS ===")
        test_file = os.path.join(PUBLIC_DIR, "audio", "test_connection.mp3")
        ok = await generate_speech("Hallo, das ist ein Test.", DEFAULT_VOICES["de"], test_file)
        print("Результат проверки:", "УСПЕШНО" if ok else "ОШИБКА ПОДКЛЮЧЕНИЯ")
        sys.exit(0 if ok else 1)

    else:
        target_unit = "--all"

    if target_unit == "--all":
        units_dir = os.path.join(PROJECT_ROOT, "data", "units")
        for root, _, files in os.walk(units_dir):
            for f in files:
                if f.endswith(".json"):
                    await process_unit(os.path.join(root, f))
    else:
        await process_unit(target_unit)


if __name__ == "__main__":
    asyncio.run(main())