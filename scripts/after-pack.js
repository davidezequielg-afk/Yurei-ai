// Se ejecuta al empaquetar: apaga en el ejecutable de Electron las funciones que sirven para abusar de él.
// Yurei no usa ninguna de ellas.
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const productName = packager.appInfo.productFilename;
  const exe = {
    win32: `${productName}.exe`,
    linux: packager.executableName,
    darwin: path.join(`${productName}.app`, 'Contents', 'MacOS', productName)
  }[electronPlatformName];
  if (!exe) throw new Error(`Plataforma no soportada: ${electronPlatformName}`);

  await flipFuses(path.join(appOutDir, exe), {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false, // ELECTRON_RUN_AS_NODE: sin esto, el .exe de Yurei serviría de intérprete de Node para cualquier malware
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // NODE_OPTIONS no puede inyectar código
    [FuseV1Options.EnableNodeCliInspectArguments]: false, // sin --inspect (depurador remoto)
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true // solo se ejecuta el código empaquetado, no una carpeta app/ añadida al lado
  });
  console.log(`  • Fusibles de seguridad aplicados a ${exe}`);
};
