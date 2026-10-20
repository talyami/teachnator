(function enforceAiVoicePolicy() {
      try {
        if (typeof window !== 'undefined') {
          window.__VOICE_POLICY__ = 'AI_ONLY_NO_ROBOT';
          if ('speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch(e){}
            window.speechSynthesis.speak = function() {
              console.warn('[Voice Engine] Robotic machine voice permanently disabled. Only AI voice is permitted.');
              try { window.speechSynthesis.cancel(); } catch(e){}
            };
          }
          if (typeof window.SpeechSynthesisUtterance !== 'undefined') {
            const _OrigUtterance = window.SpeechSynthesisUtterance;
            window.SpeechSynthesisUtterance = function() {
              console.warn('[Voice Engine] SpeechSynthesisUtterance blocked.');
              return new _OrigUtterance('');
            };
          }
        }
      } catch(e){}
    })();
  