/**
 * Food Item Autocomplete
 * Provides autocomplete functionality for food items using the USDA database
 */

function setHTMLSafe(el, html){
  if (!el) return;
  try {
    if (window.SafeHTML && window.SafeHTML.setHTML) return window.SafeHTML.setHTML(el, String(html||''));
    el.innerHTML = String(html||'');
  } catch(_) { try { el.textContent = String(html||''); } catch(__){} }
}
function escapeHtml(s){
  try { return String(s||'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;'); } catch(_) { return String(s||''); }
}

class FoodAutocomplete {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      minLength: 2,
      debounceTime: 300,
      maxResults: 10,
      ...options
    };
    
    this.resultsContainer = null;
    this.debounceTimer = null;
    this.selectedIndex = -1;
    this.results = [];
    
    this.init();
  }
  
  init() {
    // Create results container
    this.createResultsContainer();
    // Set up event listeners
    this.setupEventListeners();
  }
  
  createResultsContainer() {
    // Create container for autocomplete results
    const parent = this.input.parentElement;
    parent.classList.add('autocomplete-container');
    
    this.resultsContainer = document.createElement('div');
    this.resultsContainer.className = 'autocomplete-results';
    parent.appendChild(this.resultsContainer);
  }
  
  setupEventListeners() {
    // Input event for typing
    this.input.addEventListener('input', () => {
      this.onInput();
    });
    
    // Keyboard navigation
    this.input.addEventListener('keydown', (e) => {
      this.onKeyDown(e);
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.resultsContainer.contains(e.target)) {
        this.hideResults();
      }
    });
  }
  
  onInput() {
    const query = this.input.value.trim();
    
    // Clear any existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // Clear results if query is too short
    if (query.length < this.options.minLength) {
      this.hideResults();
      return;
    }
    
    // Set debounce timer
    this.debounceTimer = setTimeout(() => {
      this.fetchResults(query);
    }, this.options.debounceTime);
  }
  
  onKeyDown(e) {
    // If results are not shown, don't handle navigation keys
    if (!this.resultsContainer.classList.contains('show')) {
      return;
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectPrevious();
        break;
      case 'Enter':
        e.preventDefault();
        this.selectCurrent();
        break;
      case 'Escape':
        e.preventDefault();
        this.hideResults();
        break;
    }
  }
  
  async fetchResults(query) {
    // Show loading indicator
    this.showLoading();
    console.log('🔍 FoodAutocomplete: Searching for:', query);
    
    try {
      const apiUrl = `/api/marketplace/food-search?query=${encodeURIComponent(query)}`;
      console.log('🌐 Calling API endpoint:', apiUrl);
      
      // Add timestamp to track how long the request takes
      const startTime = performance.now();
      const response = await fetch(apiUrl);
      const endTime = performance.now();
      console.log(`⏱️ API response time: ${Math.round(endTime - startTime)}ms`);
      
      // Log response status
      console.log('📊 API response status:', response.status);
      
      if (!response.ok) {
        console.error(`❌ API returned error status: ${response.status}`);
        throw new Error(`API returned status ${response.status}`);
      }
      
      // Parse the JSON response
      const data = await response.json();
      console.log('📋 API response data:', data);
      console.log('📋 Data keys available:', Object.keys(data));
      
      // Check if we have items (from test page format) or data (from regular API)
      const resultsArray = data.items || data.data || [];
      
      // Check if the API call was successful
      if (!data.success) {
        console.error('❌ API returned success: false');
        throw new Error('API returned success: false');
      }
      
      // Log if we're using mock data
      if (data.isMockData) {
        console.warn('⚠️ API returned mock data instead of real data');
      } else {
        console.log('✅ Using real API data');
      }
      
      // Check if we have any results
      if (resultsArray.length > 0) {
        console.log(`✅ Found ${resultsArray.length} results from API`);
        
        // Process results through onResults callback if provided
        if (this.options.onResults && typeof this.options.onResults === 'function') {
          console.log('📋 Calling onResults callback with data');
          const processedResults = this.options.onResults(resultsArray, data.isMockData);
          
          // Use processed results if returned, otherwise use original results
          if (processedResults && Array.isArray(processedResults)) {
            this.results = processedResults.slice(0, this.options.maxResults);
            console.log('📋 Using processed results from callback:', this.results);
          } else {
            this.results = resultsArray.slice(0, this.options.maxResults);
            console.log('📋 Using original results (callback returned nothing):', this.results);
          }
        } else {
          // No callback, use results directly
          this.results = resultsArray.slice(0, this.options.maxResults);
        }
        
        console.log('📊 Final results to display:', this.results);
        this.renderResults();
        return; // Exit early after successful rendering
      }
      
      // If we get here, the API returned success but no results
      console.warn('⚠️ API returned success but no results');
      this.showNoResults();
    } catch (error) {
      console.error('❌ Error fetching autocomplete results:', error);
      console.error('Error details:', error.message);
      // API call failed, use client-side fallback
      console.warn('⚠️ API call failed, using client-side fallback');
      this.useFallbackResults(query);
    }
  }
  
  useFallbackResults(query) {
    // Client-side fallback results
    const fallbackResults = [
      { description: 'Apple', category: 'Fruit' },
      { description: 'Banana', category: 'Fruit' },
      { description: 'Carrot', category: 'Vegetable' },
      { description: 'Broccoli', category: 'Vegetable' },
      { description: 'Chicken', category: 'Meat' },
      { description: 'Beef', category: 'Meat' },
      { description: 'Pork', category: 'Meat' },
      { description: 'Fish', category: 'Seafood' },
      { description: 'Shrimp', category: 'Seafood' },
      { description: 'Lobster', category: 'Seafood' },
    ];
    
    // Filter fallback results by query
    const filteredResults = fallbackResults.filter(result => result.description.toLowerCase().includes(query.toLowerCase()));
    
    this.results = filteredResults.slice(0, this.options.maxResults);
    this.renderResults();
  }
  
  renderResults() {
    // Clear previous results
    this.resultsContainer.innerHTML = '';
    
    // Create result items
    this.results.forEach((item, index) => {
      const resultItem = document.createElement('div');
      resultItem.className = 'autocomplete-item';
      const desc = escapeHtml(item.description);
      const cat = item.category ? `<div class="item-category">${escapeHtml(item.category)}</div>` : '';
      setHTMLSafe(resultItem, `
        <div class="item-description">${desc}</div>
        ${cat}
      `);
      
      // Add click event
      resultItem.addEventListener('click', () => {
        this.selectItem(index);
      });
      
      this.resultsContainer.appendChild(resultItem);
    });
    
    // Show results
    this.showResults();
    this.selectedIndex = -1;
  }
  
  showResults() {
    this.resultsContainer.classList.add('show');
  }
  
  hideResults() {
    this.resultsContainer.classList.remove('show');
    this.selectedIndex = -1;
  }
  
  showLoading() {
    setHTMLSafe(this.resultsContainer, '<div class="autocomplete-loading">Searching...</div>');
    this.showResults();
  }
  
  showNoResults() {
    setHTMLSafe(this.resultsContainer, '<div class="autocomplete-no-results">No results found</div>');
    this.showResults();
    this.results = [];
  }
  
  selectNext() {
    if (this.results.length === 0) return;
    
    // Remove selected class from current item
    this.clearSelection();
    
    // Select next item
    this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
    this.highlightSelected();
  }
  
  selectPrevious() {
    if (this.results.length === 0) return;
    
    // Remove selected class from current item
    this.clearSelection();
    
    // Select previous item
    this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
    this.highlightSelected();
  }
  
  selectCurrent() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.results.length) {
      this.selectItem(this.selectedIndex);
    }
  }
  
  selectItem(index) {
    const item = this.results[index];
    if (item) {
      this.input.value = item.description;
      this.hideResults();
      
      // Trigger change event
      const event = new Event('change', { bubbles: true });
      this.input.dispatchEvent(event);
      
      // If we have a callback, call it
      if (this.options.onSelect) {
        this.options.onSelect(item);
      }
    }
  }
  
  clearSelection() {
    const items = this.resultsContainer.querySelectorAll('.autocomplete-item');
    items.forEach(item => item.classList.remove('selected'));
  }
  
  highlightSelected() {
    const items = this.resultsContainer.querySelectorAll('.autocomplete-item');
    if (this.selectedIndex >= 0 && this.selectedIndex < items.length) {
      items[this.selectedIndex].classList.add('selected');
      
      // Scroll into view if needed
      items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const itemInput = document.getElementById('title');
  if (itemInput) {
    new FoodAutocomplete(itemInput, {
      onSelect: (item) => {
        // Optionally update other fields based on the selected item
        const descriptionInput = document.getElementById('description');
        if (descriptionInput && item.category) {
          // If description is empty, add the category
          if (!descriptionInput.value.trim()) {
            descriptionInput.value = `Category: ${item.category}\n\nAdd more details about your ${item.description} here.`;
          }
        }
      }
    });
  }
});
