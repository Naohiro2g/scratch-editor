const searchInput = document.getElementById('search');
const kindInputs = [...document.querySelectorAll('input[name="block-kind"]')];
const categoryButtons = [...document.querySelectorAll('[data-category]')];
const sections = [...document.querySelectorAll('[data-section]')];
const cards = [...document.querySelectorAll('.block-card')];
const resultCount = document.getElementById('result-count');
let category = 'all';

const normalize = text => text.normalize('NFKC').toLocaleLowerCase('ja');
const searchText = new Map(cards.map(card => [card, normalize(card.dataset.search)]));

const updateFilters = function () {
    const kinds = new Set(kindInputs.filter(input => input.checked).map(input => input.value));
    const terms = normalize(searchInput.value).trim()
        .split(/\s+/)
        .filter(Boolean);
    let count = 0;
    for (const section of sections) {
        let sectionCount = 0;
        for (const card of section.querySelectorAll('.block-card')) {
            const visible = (category === 'all' || category === section.dataset.section) &&
                kinds.has(card.dataset.kind) &&
                terms.every(term => searchText.get(card).includes(term));
            card.hidden = !visible;
            if (visible) sectionCount++;
        }
        section.hidden = sectionCount === 0;
        count += sectionCount;
    }
    resultCount.textContent = `${count} / ${cards.length} ブロック`;
    document.getElementById('empty-results').hidden = count !== 0;
    for (const button of categoryButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.category === category));
    }
};

const revealLinkedBlock = function (hash = location.hash) {
    const target = document.getElementById(hash.slice(1));
    if (!target || !target.classList.contains('block-card')) return;
    category = 'all';
    searchInput.value = '';
    for (const input of kindInputs) input.checked = true;
    updateFilters();
    target.scrollIntoView({block: 'start'});
};

searchInput.addEventListener('input', updateFilters);
for (const input of kindInputs) input.addEventListener('change', updateFilters);
document.getElementById('clear-search').addEventListener('click', () => {
    searchInput.value = '';
    updateFilters();
    searchInput.focus();
});
const selectCategory = event => {
    category = event.currentTarget.dataset.category;
    updateFilters();
    document.querySelector('.search-panel').scrollIntoView({block: 'start'});
};
for (const button of categoryButtons) button.addEventListener('click', selectCategory);
// A link to the current hash must also reveal a block hidden by later filtering.
document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link) revealLinkedBlock(link.getAttribute('href'));
});
window.addEventListener('hashchange', () => revealLinkedBlock());
updateFilters();
revealLinkedBlock();
