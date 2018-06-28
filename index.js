const fs = require('fs')
const axios = require('axios')
const _ = require('lodash')
const cheerio = require('cheerio')
const Papa = require('papaparse')

function build_url(year) {
  return `https://www.ssa.gov/oact/NOTES/as120/LifeTables_Tbl_6_${year}.html`
}

function handleResponse($) {
  const table = $('table:not([summary])')

  const [
    genderRow,
    headerRow,
    yearRow
  ] = table.find('th')
  .parent('tr')
  .get()

  const rows = table.find('td')
    .parent('tr')
    .get()

  const year = parseYearRow(yearRow)
  const genders = parseGenderRow(genderRow)

  return genders.map(({ gender, offset, width }) => {
    const headers = $(headerRow).find('th')
      .slice(
        (!offset || offset) - 1,
        (!offset || offset) - 1 + width
      )
      .map($getCellText)
      .get()

    headers[headers.length-1] = 'ex'

    return rows.map(row => {
      const values = $('td', row)
         .slice(
          offset,
          offset + width
        )
        .map($getCellText)
        .get()
        .map(text => parseFloat(text.replace(/[^\d\.]/g)) || text)

      return Object.assign(
        { gender, year },
        _.zipObject(headers,values)
      )
    })
  })

  function $getCellText() {
    return $(this).text()
      .trim()
  }


  function parseGenderRow(row) {
    let offset = 0
    return $('th', row)
      .map(function() {
        const $this= $(this)
        const gender = $this.text()
          .trim()

        const width = parseInt($this.prop('colspan')) || 1

        const parsed = {
          gender,
          offset,
          width
        }

        offset += width

        return parsed
      })
      .get()
      .filter(x => x.gender)
  }

  function parseYearRow(row) {
    return parseInt($(row).text().match(/\d{4}/)[0])
  }
}

function flatten(arr) {
  return arr.reduce((acc,cur) => acc.concat(cur), [])
}

function deepFlatten(arr) {
  return arr.reduce((acc, cur) => acc.concat(
    cur instanceof Array
      ? deepFlatten(cur)
      : cur
    ), [])
}

function writeCSV(data) {
  return new Promise(function (resolve, reject) {
    const csv = Papa.unparse(data)

    fs.writeFile(
      'lifetables.csv',
      csv,
      { encoding: 'utf8', flags: 'w' },
      err => err ? reject(err) : resolve(true)
    )
  })
}


const start_year = 1900
const end_year = 2100
const interval = 10

const years = _.range(
  start_year,
  end_year + interval,
  interval
  )

const data = Promise.all(
  years.map(year => {
  const url = build_url(year)

  return axios.get(url)
    .then(response => response.data)
    .then(cheerio.load)
    .then(handleResponse)
  })
)
  .then(deepFlatten)
  .then(rows=>rows.filter(row=>row.x))
  .then(writeCSV)
  // .catch(()=>{})
