from pathlib import Path

path = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')
text = path.read_text(encoding='utf-8')

old_guard = """    const conversation = conversationRef.current;
    if (!conversation || !selectedLastMessageId) return;
"""
new_guard = """    const conversation = conversationRef.current;
    if (loading || !conversation || !selectedLastMessageId) return;
"""

old_dependencies = """  }, [selectedId, selectedLastMessageId]);
"""
new_dependencies = """  }, [loading, selectedId, selectedLastMessageId]);
"""

for label, old in [
    ('auto-scroll guard', old_guard),
    ('auto-scroll dependencies', old_dependencies),
]:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')

text = text.replace(old_guard, new_guard, 1)
text = text.replace(old_dependencies, new_dependencies, 1)
path.write_text(text, encoding='utf-8')

print('Fixed merchant support auto-scroll to run after the conversation finishes loading.')
