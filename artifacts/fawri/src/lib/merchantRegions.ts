export type MerchantRegionOption = {
  countryCode: string;
  callingCode: string;
  currencyCode: string;
  timezone: string;
};

const REGION_DATA: Record<string, string> = {AE:'+971|AED|Asia/Dubai',AF:'+93|AFN|Asia/Kabul',AG:'+1268|XCD|America/Antigua',AI:'+1264|XCD|America/Anguilla',AL:'+355|ALL|Europe/Tirane',AM:'+374|AMD|Asia/Yerevan',AO:'+244|AOA|Africa/Luanda',AR:'+54|ARS|America/Argentina/Buenos_Aires',AS:'+1684|USD|Pacific/Pago_Pago',AT:'+43|EUR|Europe/Vienna',AU:'+61|AUD|Australia/Lord_Howe',AW:'+297|AWG|America/Aruba',AZ:'+994|AZN|Asia/Baku',BA:'+387|BAM|Europe/Sarajevo',BB:'+1246|BBD|America/Barbados',BD:'+880|BDT|Asia/Dhaka',BE:'+32|EUR|Europe/Brussels',BF:'+226|XOF|Africa/Ouagadougou',BG:'+359|BGN|Europe/Sofia',BH:'+973|BHD|Asia/Bahrain',BI:'+257|BIF|Africa/Bujumbura',BJ:'+229|XOF|Africa/Porto-Novo',BM:'+1441|BMD|Atlantic/Bermuda',BN:'+673|BND|Asia/Brunei',BO:'+591|BOB|America/La_Paz',BR:'+55|BRL|America/Noronha',BS:'+1242|BSD|America/Nassau',BT:'+975|INR|Asia/Thimphu',BW:'+267|BWP|Africa/Gaborone',BY:'+375|BYN|Europe/Minsk',BZ:'+501|BZD|America/Belize',CA:'+1|CAD|America/St_Johns',CC:'+61|AUD|Indian/Cocos',CD:'+243|CDF|Africa/Kinshasa',CF:'+236|XAF|Africa/Bangui',CG:'+242|XAF|Africa/Brazzaville',CH:'+41|CHF|Europe/Zurich',CI:'+225|XOF|Africa/Abidjan',CK:'+682|NZD|Pacific/Rarotonga',CL:'+56|CLP|America/Santiago',CM:'+237|XAF|Africa/Douala',CN:'+86|CNY|Asia/Shanghai',CO:'+57|COP|America/Bogota',CR:'+506|CRC|America/Costa_Rica',CU:'+53|CUP|America/Havana',CV:'+238|CVE|Atlantic/Cape_Verde',CX:'+61|AUD|Indian/Christmas',CY:'+357|EUR|Asia/Nicosia',CZ:'+420|CZK|Europe/Prague',DE:'+49|EUR|Europe/Berlin',DJ:'+253|DJF|Africa/Djibouti',DK:'+45|DKK|Europe/Copenhagen',DM:'+1767|XCD|America/Dominica',DO:'+1809|DOP|America/Santo_Domingo',DZ:'+213|DZD|Africa/Algiers',EC:'+593|USD|America/Guayaquil',EE:'+372|EUR|Europe/Tallinn',EG:'+20|EGP|Africa/Cairo',EH:'+212|MAD|Africa/El_Aaiun',ER:'+291|ERN|Africa/Asmara',ES:'+34|EUR|Europe/Madrid',ET:'+251|ETB|Africa/Addis_Ababa',FI:'+358|EUR|Europe/Helsinki',FJ:'+679|FJD|Pacific/Fiji',FK:'+500|FKP|Atlantic/Stanley',FM:'+691|USD|Pacific/Chuuk',FO:'+298|DKK|Atlantic/Faroe',FR:'+33|EUR|Europe/Paris',GA:'+241|XAF|Africa/Libreville',GB:'+44|GBP|Europe/London',GD:'+1473|XCD|America/Grenada',GE:'+995|GEL|Asia/Tbilisi',GF:'+594|EUR|America/Cayenne',GG:'+44|GBP|Europe/Guernsey',GH:'+233|GHS|Africa/Accra',GI:'+350|GIP|Europe/Gibraltar',GL:'+299|DKK|America/Nuuk',GM:'+220|GMD|Africa/Banjul',GN:'+224|GNF|Africa/Conakry',GP:'+590|EUR|America/Guadeloupe',GQ:'+240|XAF|Africa/Malabo',GR:'+30|EUR|Europe/Athens',GS:'+500|GBP|Atlantic/South_Georgia',GT:'+502|GTQ|America/Guatemala',GU:'+1671|USD|Pacific/Guam',GW:'+245|XOF|Africa/Bissau',GY:'+592|GYD|America/Guyana',HK:'+852|HKD|Asia/Hong_Kong',HN:'+504|HNL|America/Tegucigalpa',HR:'+385|EUR|Europe/Zagreb',HT:'+509|HTG|America/Port-au-Prince',HU:'+36|HUF|Europe/Budapest',ID:'+62|IDR|Asia/Jakarta',IE:'+353|EUR|Europe/Dublin',IL:'+972|ILS|Asia/Jerusalem',IM:'+44|GBP|Europe/Isle_of_Man',IN:'+91|INR|Asia/Kolkata',IO:'+246|USD|Indian/Chagos',IQ:'+964|IQD|Asia/Baghdad',IR:'+98|IRR|Asia/Tehran',IS:'+354|ISK|Atlantic/Reykjavik',IT:'+39|EUR|Europe/Rome',JE:'+44|GBP|Europe/Jersey',JM:'+1876|JMD|America/Jamaica',JO:'+962|JOD|Asia/Amman',JP:'+81|JPY|Asia/Tokyo',KE:'+254|KES|Africa/Nairobi',KG:'+996|KGS|Asia/Bishkek',KH:'+855|KHR|Asia/Phnom_Penh',KI:'+686|AUD|Pacific/Tarawa',KM:'+269|KMF|Indian/Comoro',KN:'+1869|XCD|America/St_Kitts',KP:'+850|KPW|Asia/Pyongyang',KR:'+82|KRW|Asia/Seoul',KW:'+965|KWD|Asia/Kuwait',KY:'+1345|KYD|America/Cayman',KZ:'+76|KZT|Asia/Almaty',LA:'+856|LAK|Asia/Vientiane',LB:'+961|LBP|Asia/Beirut',LC:'+1758|XCD|America/St_Lucia',LI:'+423|CHF|Europe/Vaduz',LK:'+94|LKR|Asia/Colombo',LR:'+231|LRD|Africa/Monrovia',LS:'+266|ZAR|Africa/Maseru',LT:'+370|EUR|Europe/Vilnius',LU:'+352|EUR|Europe/Luxembourg',LV:'+371|EUR|Europe/Riga',LY:'+218|LYD|Africa/Tripoli',MA:'+212|MAD|Africa/Casablanca',MC:'+377|EUR|Europe/Monaco',MD:'+373|MDL|Europe/Chisinau',MG:'+261|MGA|Indian/Antananarivo',MH:'+692|USD|Pacific/Majuro',MK:'+389|MKD|Europe/Skopje',ML:'+223|XOF|Africa/Bamako',MN:'+976|MNT|Asia/Ulaanbaatar',MO:'+853|MOP|Asia/Macau',MP:'+1670|USD|Pacific/Saipan',MQ:'+596|EUR|America/Martinique',MR:'+222|MRU|Africa/Nouakchott',MS:'+1664|XCD|America/Montserrat',MT:'+356|EUR|Europe/Malta',MU:'+230|MUR|Indian/Mauritius',MV:'+960|MVR|Indian/Maldives',MW:'+265|MWK|Africa/Blantyre',MX:'+52|MXN|America/Mexico_City',MY:'+60|MYR|Asia/Kuala_Lumpur',MZ:'+258|MZN|Africa/Maputo',NA:'+264|ZAR|Africa/Windhoek',NC:'+687|XPF|Pacific/Noumea',NE:'+227|XOF|Africa/Niamey',NF:'+672|AUD|Pacific/Norfolk',NG:'+234|NGN|Africa/Lagos',NI:'+505|NIO|America/Managua',NL:'+31|EUR|Europe/Amsterdam',NO:'+47|NOK|Europe/Oslo',NP:'+977|NPR|Asia/Kathmandu',NR:'+674|AUD|Pacific/Nauru',NU:'+683|NZD|Pacific/Niue',NZ:'+64|NZD|Pacific/Auckland',OM:'+968|OMR|Asia/Muscat',PA:'+507|PAB|America/Panama',PE:'+51|PEN|America/Lima',PF:'+689|XPF|Pacific/Tahiti',PG:'+675|PGK|Pacific/Port_Moresby',PH:'+63|PHP|Asia/Manila',PK:'+92|PKR|Asia/Karachi',PL:'+48|PLN|Europe/Warsaw',PM:'+508|EUR|America/Miquelon',PN:'+64|NZD|Pacific/Pitcairn',PR:'+1787|USD|America/Puerto_Rico',PT:'+351|EUR|Europe/Lisbon',PW:'+680|USD|Pacific/Palau',PY:'+595|PYG|America/Asuncion',QA:'+974|QAR|Asia/Qatar',RE:'+262|EUR|Indian/Reunion',RO:'+40|RON|Europe/Bucharest',RS:'+381|RSD|Europe/Belgrade',RU:'+7|RUB|Europe/Kaliningrad',RW:'+250|RWF|Africa/Kigali',SA:'+966|SAR|Asia/Riyadh',SB:'+677|SBD|Pacific/Guadalcanal',SC:'+248|SCR|Indian/Mahe',SD:'+249|SDG|Africa/Khartoum',SE:'+46|SEK|Europe/Stockholm',SG:'+65|SGD|Asia/Singapore',SH:'+290|SHP|Atlantic/St_Helena',SI:'+386|EUR|Europe/Ljubljana',SJ:'+4779|NOK|Arctic/Longyearbyen',SK:'+421|EUR|Europe/Bratislava',SL:'+232|SLE|Africa/Freetown',SM:'+378|EUR|Europe/San_Marino',SN:'+221|XOF|Africa/Dakar',SO:'+252|SOS|Africa/Mogadishu',SR:'+597|SRD|America/Paramaribo',SS:'+211|SSP|Africa/Juba',ST:'+239|STN|Africa/Sao_Tome',SV:'+503|USD|America/El_Salvador',SY:'+963|SYP|Asia/Damascus',SZ:'+268|SZL|Africa/Mbabane',TD:'+235|XAF|Africa/Ndjamena',TG:'+228|XOF|Africa/Lome',TH:'+66|THB|Asia/Bangkok',TJ:'+992|TJS|Asia/Dushanbe',TK:'+690|NZD|Pacific/Fakaofo',TL:'+670|USD|Asia/Dili',TM:'+993|TMT|Asia/Ashgabat',TN:'+216|TND|Africa/Tunis',TO:'+676|TOP|Pacific/Tongatapu',TR:'+90|TRY|Europe/Istanbul',TT:'+1868|TTD|America/Port_of_Spain',TV:'+688|AUD|Pacific/Funafuti',TW:'+886|TWD|Asia/Taipei',TZ:'+255|TZS|Africa/Dar_es_Salaam',UA:'+380|UAH|Europe/Simferopol',UG:'+256|UGX|Africa/Kampala',US:'+1|USD|America/New_York',UY:'+598|UYU|America/Montevideo',UZ:'+998|UZS|Asia/Samarkand',VC:'+1784|XCD|America/St_Vincent',VE:'+58|VES|America/Caracas',VN:'+84|VND|Asia/Ho_Chi_Minh',VU:'+678|VUV|Pacific/Efate',WF:'+681|XPF|Pacific/Wallis',WS:'+685|WST|Pacific/Apia',XK:'+383|EUR|Europe/Belgrade',YE:'+967|YER|Asia/Aden',YT:'+262|EUR|Indian/Mayotte',ZA:'+27|ZAR|Africa/Johannesburg',ZM:'+260|ZMW|Africa/Lusaka',ZW:'+263|USD|Africa/Harare'};

const CALLING_CODE_OVERRIDES: Record<string, string> = {
  // North American Numbering Plan regions share E.164 country calling code +1.
  AG: '+1', AI: '+1', AS: '+1', BB: '+1', BM: '+1', BS: '+1', CA: '+1',
  DM: '+1', DO: '+1', GD: '+1', GU: '+1', JM: '+1', KN: '+1', KY: '+1',
  LC: '+1', MP: '+1', MS: '+1', PR: '+1', SX: '+1', TC: '+1', TT: '+1',
  US: '+1', VC: '+1', VG: '+1', VI: '+1',
  // Russia and Kazakhstan share calling code +7; Svalbard/Jan Mayen share +47.
  KZ: '+7',
  SJ: '+47',
};

const EXTRA_CALLING_CODES: Record<string, string> = {
  AC: '+247', BL: '+590', BQ: '+599', CW: '+599', MF: '+590', PS: '+970',
  SX: '+1', TC: '+1', VA: '+39', VG: '+1', VI: '+1',
};

// Currency defaults are intentionally conservative. New global signups must
// explicitly choose a currency when a country is not listed here; Fawri does
// not silently guess from stale country datasets.
export const SAFE_MERCHANT_CURRENCY_BY_COUNTRY: Readonly<Record<string, string>> = {
  AE: 'AED', AU: 'AUD', BH: 'BHD', CA: 'CAD', CN: 'CNY', EG: 'EGP',
  GB: 'GBP', IN: 'INR', IQ: 'IQD', JO: 'JOD', JP: 'JPY', KR: 'KRW',
  KW: 'KWD', NZ: 'NZD', OM: 'OMR', QA: 'QAR', SA: 'SAR', SG: 'SGD',
  TR: 'TRY', US: 'USD',
};

export function merchantSupportedCurrencyCodes(): string[] {
  const runtime = (Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  }).supportedValuesOf;
  if (typeof runtime === 'function') {
    try {
      const codes = runtime('currency')
        .filter(code => /^[A-Z]{3}$/.test(code))
        .sort();
      if (codes.length > 0) return codes;
    } catch {
      // Fall through to the conservative launch fallback below.
    }
  }
  return [
    'AED','AUD','BHD','CAD','CHF','CNY','DKK','EGP','EUR','GBP','HKD','INR',
    'IQD','JOD','JPY','KRW','KWD','NOK','NZD','OMR','QAR','SAR','SEK','SGD',
    'TRY','USD',
  ];
}

export const MERCHANT_REGION_OPTIONS: readonly MerchantRegionOption[] = [
  ...Object.entries(REGION_DATA).map(([countryCode, packed]) => {
    const [datasetCallingCode, currencyCode, timezone] = packed.split('|');
    const callingCode = CALLING_CODE_OVERRIDES[countryCode] || datasetCallingCode;
    return { countryCode, callingCode, currencyCode, timezone };
  }),
  ...Object.entries(EXTRA_CALLING_CODES)
    .filter(([countryCode]) => !(countryCode in REGION_DATA))
    .map(([countryCode, callingCode]) => ({
      countryCode,
      callingCode,
      currencyCode: '',
      timezone: '',
    })),
].sort((left, right) => left.countryCode.localeCompare(right.countryCode));

export const MERCHANT_REGION_BY_COUNTRY = new Map(
  MERCHANT_REGION_OPTIONS.map(option => [option.countryCode, option]),
);

export const MERCHANT_CURRENCY_CODES = merchantSupportedCurrencyCodes();
