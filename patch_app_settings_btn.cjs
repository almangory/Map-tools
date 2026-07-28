const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const settingsBtn = `
             <button onClick={() => setShowSettingsModal(true)} className="p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Settings2 className="w-5 h-5" /><span className="text-[8px] font-bold">{lang === 'ar' ? 'إعدادات' : 'SETTINGS'}</span></button>
`;

code = code.replace(
    `<span className="text-[8px] font-bold">THEME</span></button>`,
    `<span className="text-[8px] font-bold">THEME</span></button>${settingsBtn}`
);

fs.writeFileSync('App.tsx', code);
