const { Parser } = require('json2csv');

const exportToCSV = (data, fields, filename, res) => {
  try {
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);

    return res.status(200).send(csv);
  } catch (error) {
    console.error('CSV Export Error:', error);
    return res.status(500).json({ error: 'Failed to generate CSV export.' });
  }
};

module.exports = {
  exportToCSV
};
