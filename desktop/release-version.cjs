// Public versions are UTC CalVer. Native/package fields are compatibility encodings only.
function parseCalVer(value) {
  const match = /^v?(20\d{2})\.(\d{2})\.(\d{2})\.(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  )
    return null;
  return { numbers: [year, month, day, hour, minute], timestamp, calver: true };
}
function releaseVersions(release) {
  const parsed = parseCalVer(release.version);
  if (
    !parsed ||
    release.timezone !== 'UTC' ||
    !['preview', 'beta', 'stable'].includes(release.channel)
  )
    throw new Error('Invalid UTC CalVer release metadata');
  const [year, month, day, hour, minute] = parsed.numbers;
  const days =
    Math.floor(
      (Date.UTC(year, month - 1, day) - Date.UTC(2020, 0, 1)) / 86400000,
    ) + 1;
  if (days < 1 || days > 9999)
    throw new Error('Release outside native build-number range');
  return {
    packageVersion: `${year}.${month}.${day}-build.${hour * 60 + minute}`,
    shortVersion: `${year}.${month}.${day}`,
    buildVersion: `${days}.${hour}.${minute}`,
  };
}
module.exports = { parseCalVer, releaseVersions };
