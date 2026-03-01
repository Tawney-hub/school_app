frappe.ui.form.on('Student', {
	student_class: function(frm) {
		if (frm.doc.student_class && frm.doc.section) {
			frappe.show_alert({
				message: `Class: ${frm.doc.student_class} - ${frm.doc.section}`,
				indicator: 'green'
			});
		}
	}
});
