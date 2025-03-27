/**
 * FAQ Modal Functionality
 * Handles the opening and closing of the FAQ modal
 */

document.addEventListener('DOMContentLoaded', function() {
    const faqModal = document.getElementById('faqModal');
    const faqButton = document.getElementById('faqButton');
    const closeFaqModal = document.getElementById('closeFaqModal');

    // Show modal
    faqButton.addEventListener('click', () => {
        faqModal.classList.remove('hidden');
    });

    // Hide modal when clicking outside
    faqModal.addEventListener('click', () => {
        faqModal.classList.add('hidden');
    });

    // Hide modal when clicking X button
    closeFaqModal.addEventListener('click', (e) => {
        e.stopPropagation();
        faqModal.classList.add('hidden');
    });
}); 