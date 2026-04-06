import sharp from 'sharp'

const svg = `<svg width='512' height='512' xmlns='http://www.w3.org/2000/svg'>
  <rect width='512' height='512' rx='102' fill='#111827'/>

  <!-- DAD x=76: tallest, brown hair, glasses, blue shirt -->
  <rect x='64' y='355' width='13' height='90' rx='5' fill='#1e40af'/>
  <rect x='79' y='355' width='13' height='90' rx='5' fill='#1e40af'/>
  <rect x='56' y='258' width='44' height='102' rx='8' fill='#3b82f6'/>
  <rect x='34' y='262' width='22' height='11' rx='5' fill='#3b82f6'/>
  <rect x='100' y='262' width='22' height='11' rx='5' fill='#3b82f6'/>
  <rect x='69' y='246' width='14' height='18' rx='3' fill='#fcd9a0'/>
  <circle cx='76' cy='222' r='32' fill='#fcd9a0'/>
  <ellipse cx='76' cy='196' rx='32' ry='14' fill='#78350f'/>
  <rect x='44' y='196' width='64' height='14' rx='6' fill='#78350f'/>
  <circle cx='68' cy='220' r='4' fill='#1f2937'/>
  <circle cx='84' cy='220' r='4' fill='#1f2937'/>
  <circle cx='68' cy='220' r='8' fill='none' stroke='#9ca3af' stroke-width='2.5'/>
  <circle cx='84' cy='220' r='8' fill='none' stroke='#9ca3af' stroke-width='2.5'/>
  <line x1='44' y1='220' x2='60' y2='220' stroke='#9ca3af' stroke-width='2.5'/>
  <line x1='92' y1='220' x2='108' y2='220' stroke='#9ca3af' stroke-width='2.5'/>
  <path d='M 69 232 Q 76 238 83 232' fill='none' stroke='#b45309' stroke-width='2.5' stroke-linecap='round'/>

  <!-- MOM x=168: blonde long hair, pink shirt -->
  <rect x='157' y='360' width='12' height='85' rx='5' fill='#9d174d'/>
  <rect x='171' y='360' width='12' height='85' rx='5' fill='#9d174d'/>
  <rect x='148' y='265' width='42' height='100' rx='8' fill='#ec4899'/>
  <rect x='126' y='269' width='22' height='11' rx='5' fill='#ec4899'/>
  <rect x='190' y='269' width='22' height='11' rx='5' fill='#ec4899'/>
  <rect x='161' y='253' width='14' height='18' rx='3' fill='#fcd9a0'/>
  <circle cx='168' cy='229' r='30' fill='#fcd9a0'/>
  <ellipse cx='168' cy='204' rx='30' ry='13' fill='#fbbf24'/>
  <rect x='138' y='204' width='14' height='70' rx='7' fill='#fbbf24'/>
  <rect x='196' y='204' width='14' height='70' rx='7' fill='#fbbf24'/>
  <circle cx='161' cy='227' r='3.5' fill='#1f2937'/>
  <circle cx='175' cy='227' r='3.5' fill='#1f2937'/>
  <path d='M 162 238 Q 168 244 174 238' fill='none' stroke='#b45309' stroke-width='2.5' stroke-linecap='round'/>

  <!-- GIRL 7yo x=256: light blonde long hair, purple dress -->
  <rect x='246' y='368' width='11' height='77' rx='4' fill='#6d28d9'/>
  <rect x='259' y='368' width='11' height='77' rx='4' fill='#6d28d9'/>
  <path d='M 238 358 L 274 358 L 280 445 L 232 445 Z' fill='#a78bfa'/>
  <rect x='240' y='272' width='32' height='92' rx='7' fill='#a78bfa'/>
  <rect x='220' y='276' width='20' height='10' rx='4' fill='#a78bfa'/>
  <rect x='272' y='276' width='20' height='10' rx='4' fill='#a78bfa'/>
  <rect x='250' y='261' width='12' height='16' rx='3' fill='#fcd9a0'/>
  <circle cx='256' cy='241' r='27' fill='#fcd9a0'/>
  <ellipse cx='256' cy='218' rx='27' ry='12' fill='#fde68a'/>
  <rect x='229' y='218' width='12' height='55' rx='6' fill='#fde68a'/>
  <rect x='271' y='218' width='12' height='55' rx='6' fill='#fde68a'/>
  <circle cx='249' cy='239' r='3' fill='#1f2937'/>
  <circle cx='263' cy='239' r='3' fill='#1f2937'/>
  <path d='M 250 250 Q 256 255 262 250' fill='none' stroke='#b45309' stroke-width='2' stroke-linecap='round'/>

  <!-- BOY 5yo x=340: blonde hair, green shirt -->
  <rect x='330' y='375' width='10' height='70' rx='4' fill='#065f46'/>
  <rect x='342' y='375' width='10' height='70' rx='4' fill='#065f46'/>
  <rect x='323' y='283' width='34' height='97' rx='7' fill='#34d399'/>
  <rect x='304' y='287' width='19' height='10' rx='4' fill='#34d399'/>
  <rect x='357' y='287' width='19' height='10' rx='4' fill='#34d399'/>
  <rect x='333' y='272' width='12' height='16' rx='3' fill='#fcd9a0'/>
  <circle cx='339' cy='252' r='25' fill='#fcd9a0'/>
  <ellipse cx='339' cy='230' rx='25' ry='11' fill='#fde68a'/>
  <rect x='314' y='236' width='10' height='18' rx='4' fill='#fde68a'/>
  <rect x='355' y='236' width='10' height='18' rx='4' fill='#fde68a'/>
  <circle cx='333' cy='250' r='2.5' fill='#1f2937'/>
  <circle cx='345' cy='250' r='2.5' fill='#1f2937'/>
  <path d='M 334 260 Q 339 265 344 260' fill='none' stroke='#b45309' stroke-width='2' stroke-linecap='round'/>

  <!-- BOY 3yo x=430: light brown-blonde hair, orange shirt, smallest -->
  <rect x='421' y='385' width='9' height='60' rx='4' fill='#c2410c'/>
  <rect x='432' y='385' width='9' height='60' rx='4' fill='#c2410c'/>
  <rect x='414' y='296' width='32' height='94' rx='7' fill='#f97316'/>
  <rect x='396' y='300' width='18' height='9' rx='4' fill='#f97316'/>
  <rect x='446' y='300' width='18' height='9' rx='4' fill='#f97316'/>
  <rect x='424' y='285' width='12' height='16' rx='3' fill='#fcd9a0'/>
  <circle cx='430' cy='265' r='23' fill='#fcd9a0'/>
  <ellipse cx='430' cy='244' rx='23' ry='10' fill='#d97706'/>
  <rect x='407' y='249' width='9' height='18' rx='4' fill='#d97706'/>
  <rect x='444' y='249' width='9' height='18' rx='4' fill='#d97706'/>
  <circle cx='424' cy='263' r='2.5' fill='#1f2937'/>
  <circle cx='436' cy='263' r='2.5' fill='#1f2937'/>
  <path d='M 425 273 Q 430 278 435 273' fill='none' stroke='#b45309' stroke-width='2' stroke-linecap='round'/>
</svg>`

async function makeIcon(size) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`)
  console.log(`Created icon-${size}.png`)
}

await Promise.all([makeIcon(192), makeIcon(512)])
