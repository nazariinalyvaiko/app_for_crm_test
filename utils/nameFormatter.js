function splitFullName(fullName) {
  if (!fullName) return { firstName: '', lastName: '' };
  
  const parts = fullName.split(' ').filter(p => p);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || ''
  };
}

module.exports = { splitFullName };

