const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const FULL_BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <include domain="sharedpref" path="." />
  <exclude domain="sharedpref" path="SecureStore" />
</full-backup-content>
`;

const FULL_BACKUP_RULES_API_28 = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <include domain="sharedpref" path="." />
  <exclude domain="sharedpref" path="SecureStore" />
  <include domain="database" path="." requireFlags="deviceToDeviceTransfer" />
  <include domain="file" path="." requireFlags="deviceToDeviceTransfer" />
</full-backup-content>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <include domain="sharedpref" path="." />
    <exclude domain="sharedpref" path="SecureStore" />
  </cloud-backup>
  <device-transfer>
    <include domain="sharedpref" path="." />
    <exclude domain="sharedpref" path="SecureStore" />
    <include domain="database" path="." />
    <include domain="file" path="." />
  </device-transfer>
</data-extraction-rules>
`;

const withAndroidBackupRules = (config) => {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android main application is missing');
    application.$['android:allowBackup'] = 'true';
    application.$['android:fullBackupContent'] = '@xml/bakplanla_backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/bakplanla_data_extraction_rules';
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      await fs.mkdir(xmlDir, { recursive: true });
      const api28XmlDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml-v28');
      await fs.mkdir(api28XmlDir, { recursive: true });
      await Promise.all([
        fs.writeFile(path.join(xmlDir, 'bakplanla_backup_rules.xml'), FULL_BACKUP_RULES),
        fs.writeFile(path.join(api28XmlDir, 'bakplanla_backup_rules.xml'), FULL_BACKUP_RULES_API_28),
        fs.writeFile(path.join(xmlDir, 'bakplanla_data_extraction_rules.xml'), DATA_EXTRACTION_RULES),
      ]);
      return config;
    },
  ]);
};

module.exports = withAndroidBackupRules;
module.exports.FULL_BACKUP_RULES = FULL_BACKUP_RULES;
module.exports.FULL_BACKUP_RULES_API_28 = FULL_BACKUP_RULES_API_28;
module.exports.DATA_EXTRACTION_RULES = DATA_EXTRACTION_RULES;
