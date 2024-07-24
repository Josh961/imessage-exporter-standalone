function formatPhoneNumber(phoneNumber) {
  // Remove all non-digit characters except for the leading '+'
  const cleaned = ('' + phoneNumber).replace(/^(\+)|\D/g, "$1");

  // Check if it's a US number (starts with '+1' and has 11 digits)
  if (cleaned.startsWith('+1') && cleaned.length === 12) {
    // US format: return without country code and format as (XXX) XXX-XXXX
    return cleaned.slice(2).replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  }

  // For other cases, keep the original formatting logic
  if (cleaned.startsWith('+')) {
    // International format
    if (cleaned.length > 11) {
      // For numbers longer than 11 digits (including '+'), group in 3s
      return cleaned.replace(/(\+\d{1,3})(\d{3})(\d{3})(\d{1,})/, '$1 $2 $3 $4');
    } else {
      // For shorter international numbers, just add spaces
      return cleaned.replace(/(\+\d{1,3})(\d{3,4})(\d{3,4})/, '$1 $2 $3');
    }
  } else {
    // Domestic format
    const match = cleaned.match(/^(\d{1,3})(\d{0,3})(\d{0,4})$/);
    if (match) {
      const parts = match.slice(1).filter(Boolean);
      if (parts.length > 1) {
        return '(' + parts[0] + ') ' + parts.slice(1).join('-');
      } else {
        return parts[0];
      }
    }
  }

  // If we couldn't format it, return the original input
  return phoneNumber;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatPhoneNumber };
}
